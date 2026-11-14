// Abonos: un turno fijo (misma cancha, mismo día y hora) todas las semanas.
// La regla se guarda en `abonos`; el programa la convierte en reservas comunes de
// las próximas semanas, así la grilla, los cobros y los reportes no necesitan saber nada de abonos.
import type { z } from 'zod';
import type { BaseDeDatos } from '../db/conexion';
import type { esquemaAbono, esquemaTerminarAbono } from '@compartido/esquemas';
import { esHorarioDeCancha, sumarMinutos, type Deporte } from '@compartido/canchas';
import { fechasDeUnDia, sumarDias } from '@compartido/horarios';
import type { Abono, ResultadoAbono } from '@compartido/tipos';
import { bloqueoQueCubre, textoDelBloqueo } from './bloqueos';
import { obtenerCancha } from './canchas';
import { ErrorDeUsuario } from './errores';
import { fechaLocal, horaLocal } from './fechas';
import { cancelarReserva } from './reservas';

/** Con cuánta anticipación se cargan los turnos de un abono. */
export const HORIZONTE_DIAS = 56;

interface FilaAbono {
  id: number;
  canchaId: number;
  clienteId: number;
  diaSemana: number;
  desde: string;
  hasta: string;
  desdeFecha: string;
  hastaFecha: string | null;
  precioCentavos: number;
  nota: string;
}

const SELECT_ABONO = `SELECT id, cancha_id AS canchaId, cliente_id AS clienteId, dia_semana AS diaSemana, desde, hasta,
  desde_fecha AS desdeFecha, hasta_fecha AS hastaFecha, precio_centavos AS precioCentavos, nota FROM abonos`;

/**
 * Carga las reservas que le faltan a un abono entre `desde` y `hasta`. Las fechas que ya
 * tuvieron una reserva de este abono (aunque se haya cancelado o movido) no se tocan: si alguien
 * canceló esa semana, no vuelve a aparecer sola.
 */
function cargarTurnos(db: BaseDeDatos, a: FilaAbono, desde: string, hasta: string, ahora: Date, usuarioId: number | null): { creadas: number; omitidas: ResultadoAbono['omitidas'] } {
  const limite = a.hastaFecha !== null && a.hastaFecha < hasta ? a.hastaFecha : hasta;
  const inicio = a.desdeFecha > desde ? a.desdeFecha : desde;
  const cancha = obtenerCancha(db, a.canchaId);
  const existentes = new Set((db.$client.prepare('SELECT fecha FROM reservas WHERE abono_id = ?').all(a.id) as { fecha: string }[]).map((f) => f.fecha));
  const insertar = db.$client.prepare(
    'INSERT INTO reservas (cancha_id, cliente_id, fecha, desde, hasta, precio_centavos, nota, dado_por, abono_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  const omitidas: ResultadoAbono['omitidas'] = [];
  let creadas = 0;
  for (const fecha of fechasDeUnDia(a.diaSemana, inicio, limite)) {
    if (existentes.has(fecha)) continue;
    if (fecha < fechaLocal(ahora) || (fecha === fechaLocal(ahora) && a.hasta <= horaLocal(ahora))) continue; // el pasado no se carga
    if (!cancha.activo) {
      omitidas.push({ fecha, motivo: `${cancha.nombre} está dada de baja` });
      continue;
    }
    if (!esHorarioDeCancha(cancha, a.desde)) {
      omitidas.push({ fecha, motivo: `${cancha.nombre} no tiene turno a las ${a.desde}` });
      continue;
    }
    const bloqueo = bloqueoQueCubre(db, a.canchaId, fecha, a.desde, a.hasta);
    if (bloqueo) {
      omitidas.push({ fecha, motivo: `bloqueado: ${textoDelBloqueo(bloqueo)}` });
      continue;
    }
    try {
      insertar.run(a.canchaId, a.clienteId, fecha, a.desde, a.hasta, a.precioCentavos, a.nota, usuarioId, a.id);
      creadas++;
    } catch (error) {
      if (error instanceof Error && error.message.includes('reserva_superpuesta')) omitidas.push({ fecha, motivo: 'ya estaba reservado' });
      else throw error;
    }
  }
  return { creadas, omitidas };
}

export function crearAbono(db: BaseDeDatos, datos: z.output<typeof esquemaAbono>, ahora: Date, usuarioId: number | null): ResultadoAbono {
  const cancha = obtenerCancha(db, datos.canchaId);
  if (!cancha.activo) throw new ErrorDeUsuario(`${cancha.nombre} está dada de baja.`);
  const cliente = db.$client.prepare('SELECT activo FROM clientes WHERE id = ?').get(datos.clienteId) as { activo: number } | undefined;
  if (!cliente) throw new ErrorDeUsuario('Ese cliente ya no existe.');
  if (cliente.activo !== 1) throw new ErrorDeUsuario('Ese cliente está dado de baja.');
  if (!esHorarioDeCancha(cancha, datos.desde)) throw new ErrorDeUsuario(`${cancha.nombre} no tiene turno a las ${datos.desde}.`);
  const hoy = fechaLocal(ahora);
  if (datos.hastaFecha !== null && datos.hastaFecha < hoy) throw new ErrorDeUsuario('La fecha final del abono ya pasó.');
  const hasta = sumarMinutos(datos.desde, cancha.duracionMin);

  return db.$client.transaction(() => {
    const id = Number(
      db.$client
        .prepare('INSERT INTO abonos (cancha_id, cliente_id, dia_semana, desde, hasta, desde_fecha, hasta_fecha, precio_centavos, nota) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(datos.canchaId, datos.clienteId, datos.diaSemana, datos.desde, hasta, datos.desdeFecha, datos.hastaFecha, datos.precioCentavos, datos.nota).lastInsertRowid,
    );
    const abono = db.$client.prepare(`${SELECT_ABONO} WHERE id = ?`).get(id) as FilaAbono;
    const { creadas, omitidas } = cargarTurnos(db, abono, hoy, sumarDias(hoy, HORIZONTE_DIAS), ahora, usuarioId);
    if (creadas === 0) {
      throw new ErrorDeUsuario(
        omitidas.length ? `No se pudo reservar ningún turno: ${omitidas[0]!.motivo} (${omitidas[0]!.fecha}).` : 'Con esas fechas no queda ningún turno para reservar.',
      );
    }
    return { id, creadas, omitidas };
  })();
}

/** Mantiene cargadas las próximas semanas de todos los abonos vigentes (se llama al abrir y una vez por día). */
export function extenderAbonos(db: BaseDeDatos, ahora: Date = new Date()): number {
  const hoy = fechaLocal(ahora);
  const abonos = db.$client.prepare(`${SELECT_ABONO} WHERE activo = 1 AND (hasta_fecha IS NULL OR hasta_fecha >= ?)`).all(hoy) as FilaAbono[];
  return db.$client.transaction(() => abonos.reduce((suma, a) => suma + cargarTurnos(db, a, hoy, sumarDias(hoy, HORIZONTE_DIAS), ahora, null).creadas, 0))();
}

export function listarAbonos(db: BaseDeDatos, ahora: Date = new Date()): Abono[] {
  const filas = db.$client
    .prepare(
      `SELECT a.id, a.cancha_id AS canchaId, ca.nombre AS cancha, ca.deporte, a.cliente_id AS clienteId, cl.nombre AS cliente, cl.telefono,
              a.dia_semana AS diaSemana, a.desde, a.hasta, a.desde_fecha AS desdeFecha, a.hasta_fecha AS hastaFecha,
              a.precio_centavos AS precioCentavos, a.nota, a.activo,
              (SELECT MIN(r.fecha) FROM reservas r WHERE r.abono_id = a.id AND r.estado = 'reservada' AND r.fecha >= @hoy) AS proxima,
              (SELECT COUNT(*) FROM reservas r WHERE r.abono_id = a.id AND r.estado = 'reservada' AND r.fecha >= @hoy) AS pendientes
         FROM abonos a
         JOIN canchas ca ON ca.id = a.cancha_id
         JOIN clientes cl ON cl.id = a.cliente_id
        ORDER BY a.activo DESC, a.dia_semana, a.desde, a.id`,
    )
    .all({ hoy: fechaLocal(ahora) }) as (Omit<Abono, 'activo' | 'deporte'> & { activo: number; deporte: Deporte })[];
  return filas.map((f) => ({ ...f, activo: f.activo === 1 }));
}

/** Termina el abono y cancela los turnos que todavía no se jugaron. Devuelve cuántos canceló. */
export function terminarAbono(db: BaseDeDatos, datos: z.output<typeof esquemaTerminarAbono>, ahora: Date = new Date()): number {
  const abono = db.$client.prepare('SELECT activo FROM abonos WHERE id = ?').get(datos.id) as { activo: number } | undefined;
  if (!abono) throw new ErrorDeUsuario('Ese abono ya no existe.');
  if (abono.activo !== 1) throw new ErrorDeUsuario('Ese abono ya estaba terminado.');
  const hoy = fechaLocal(ahora);
  return db.$client.transaction(() => {
    const pendientes = db.$client
      .prepare(`SELECT id FROM reservas WHERE abono_id = ? AND estado = 'reservada' AND (fecha > ? OR (fecha = ? AND hasta > ?))`)
      .all(datos.id, hoy, hoy, horaLocal(ahora)) as { id: number }[];
    for (const r of pendientes) cancelarReserva(db, { id: r.id, devolverSena: datos.devolverSena }, ahora);
    db.$client.prepare('UPDATE abonos SET activo = 0, hasta_fecha = ? WHERE id = ?').run(hoy, datos.id);
    return pendientes.length;
  })();
}
