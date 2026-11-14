// Reservas: quién juega en qué cancha, a qué hora, a qué precio y cómo va de pagos.
// Las reglas importantes (no pisar horarios, no reservar el pasado, que el turno
// sea uno de los de la cancha) se controlan ACÁ además de en la ventana.
import type { z } from 'zod';
import type { BaseDeDatos } from '../db/conexion';
import type { esquemaCancelacion, esquemaMover, esquemaRango, esquemaReserva } from '@compartido/esquemas';
import { estadoDePago, esHorarioDeCancha, estadosPosibles, precioDelTurno, sePuedeCancelar, sumarMinutos, type EstadoReserva } from '@compartido/canchas';
import { pesos } from '@compartido/dinero';
import type { PagoDeReserva, Reserva } from '@compartido/tipos';
import { bloqueoQueCubre, textoDelBloqueo } from './bloqueos';
import { obtenerCancha } from './canchas';
import { ErrorDeUsuario } from './errores';
import { fechaLocal, horaLocal, momentoLocal } from './fechas';

interface Fila extends Omit<Reserva, 'pagadoCentavos' | 'estadoDePago' | 'pagos'> {}

const SELECT = `
  SELECT r.id, r.cancha_id AS canchaId, r.cliente_id AS clienteId, r.fecha, r.desde, r.hasta, r.estado,
         r.precio_centavos AS precioCentavos, r.nota, c.nombre AS cliente, c.telefono,
         u.nombre AS dadoPor, r.creado_en AS creadoEn, r.abono_id AS abonoId
    FROM reservas r
    JOIN clientes c ON c.id = r.cliente_id
    LEFT JOIN usuarios u ON u.id = r.dado_por`;

/** Les agrega a las filas sus pagos vigentes y el estado de pago. */
function conPagos(db: BaseDeDatos, filas: Fila[]): Reserva[] {
  if (!filas.length) return [];
  const pagos = db.$client
    .prepare(
      `SELECT p.id, p.reserva_id AS reservaId, p.monto_centavos AS montoCentavos, p.metodo, u.nombre AS usuario, p.creado_en AS creadoEn
         FROM pagos p LEFT JOIN usuarios u ON u.id = p.usuario_id
        WHERE p.anulado = 0 AND p.reserva_id IN (${filas.map(() => '?').join(',')})
        ORDER BY p.id`,
    )
    .all(...filas.map((f) => f.id)) as (PagoDeReserva & { reservaId: number })[];
  return filas.map((f) => {
    const propios = pagos.filter((p) => p.reservaId === f.id).map(({ reservaId: _r, ...p }) => p);
    const pagado = propios.reduce((suma, p) => suma + p.montoCentavos, 0);
    return { ...f, pagos: propios, pagadoCentavos: pagado, estadoDePago: estadoDePago(f.precioCentavos, pagado) };
  });
}

export function obtenerReserva(db: BaseDeDatos, id: number): Reserva {
  const fila = db.$client.prepare(`${SELECT} WHERE r.id = ?`).get(id) as Fila | undefined;
  if (!fila) throw new ErrorDeUsuario('Esa reserva ya no existe.');
  return conPagos(db, [fila])[0]!;
}

/** Las reservas de un rango de días, sin las canceladas (liberan el horario). */
export function reservasDelRango(db: BaseDeDatos, rango: z.output<typeof esquemaRango>): Reserva[] {
  const filas = db.$client.prepare(`${SELECT} WHERE r.fecha BETWEEN ? AND ? AND r.estado <> 'cancelada' ORDER BY r.fecha, r.desde, r.cancha_id`).all(rango.desde, rango.hasta) as Fila[];
  return conPagos(db, filas);
}

const esSuperposicion = (error: unknown) => error instanceof Error && error.message.includes('reserva_superpuesta');

export function crearReserva(db: BaseDeDatos, datos: z.output<typeof esquemaReserva>, ahora: Date, usuarioId: number): number {
  const cancha = obtenerCancha(db, datos.canchaId);
  if (!cancha.activo) throw new ErrorDeUsuario(`${cancha.nombre} está dada de baja.`);
  const cliente = db.$client.prepare('SELECT activo FROM clientes WHERE id = ?').get(datos.clienteId) as { activo: number } | undefined;
  if (!cliente) throw new ErrorDeUsuario('Ese cliente ya no existe.');
  if (cliente.activo !== 1) throw new ErrorDeUsuario('Ese cliente está dado de baja.');
  if (!esHorarioDeCancha(cancha, datos.desde)) throw new ErrorDeUsuario(`${cancha.nombre} no tiene turno a las ${datos.desde}.`);

  const hasta = sumarMinutos(datos.desde, cancha.duracionMin);
  // No se reserva el pasado: un turno de hoy se puede tomar hasta que termina
  if (datos.fecha < fechaLocal(ahora) || (datos.fecha === fechaLocal(ahora) && hasta <= horaLocal(ahora))) {
    throw new ErrorDeUsuario('Ese horario ya pasó.');
  }
  const bloqueo = bloqueoQueCubre(db, datos.canchaId, datos.fecha, datos.desde, hasta);
  if (bloqueo) throw new ErrorDeUsuario(`${cancha.nombre} está cerrada en ese horario: ${textoDelBloqueo(bloqueo)}.`);
  const precio = datos.precioCentavos ?? precioDelTurno(cancha, datos.fecha, datos.desde);
  if (datos.senaCentavos > precio) throw new ErrorDeUsuario('La seña no puede ser más que el precio.');

  return db.$client.transaction(() => {
    let id: number;
    try {
      id = Number(
        db.$client
          .prepare('INSERT INTO reservas (cancha_id, cliente_id, fecha, desde, hasta, precio_centavos, nota, dado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .run(datos.canchaId, datos.clienteId, datos.fecha, datos.desde, hasta, precio, datos.nota, usuarioId).lastInsertRowid,
      );
    } catch (error) {
      if (esSuperposicion(error)) throw new ErrorDeUsuario('Ese horario ya está reservado.');
      throw error;
    }
    if (datos.senaCentavos > 0) {
      db.$client
        .prepare('INSERT INTO pagos (reserva_id, monto_centavos, metodo, usuario_id, creado_en) VALUES (?, ?, ?, ?, ?)')
        .run(id, datos.senaCentavos, datos.metodoSena, usuarioId, momentoLocal(ahora));
    }
    return id;
  })();
}

export function cambiarEstado(db: BaseDeDatos, id: number, estado: EstadoReserva, ahora: Date = new Date()): void {
  const r = obtenerReserva(db, id);
  if (estado === 'cancelada') throw new ErrorDeUsuario('Para cancelar usá "Cancelar reserva": hay que decidir qué pasa con la seña.');
  if (!estadosPosibles(r.estado, r.fecha, fechaLocal(ahora)).includes(estado)) {
    throw new ErrorDeUsuario(
      r.estado === 'reservada' && r.fecha > fechaLocal(ahora) ? 'Todavía no llegó el día de la reserva.' : 'Ese cambio de estado no se puede hacer.',
    );
  }
  try {
    db.$client.prepare(`UPDATE reservas SET estado = ?, actualizado_en = datetime('now', 'localtime') WHERE id = ?`).run(estado, id);
  } catch (error) {
    if (esSuperposicion(error)) throw new ErrorDeUsuario('Ese horario lo tomó otra reserva mientras tanto.');
    throw error;
  }
}

/**
 * Cancela una reserva pendiente. Si el cliente ya había pagado algo, quien cancela
 * decide: devolverlo (los pagos quedan anulados) o quedárselo (cancelación tardía).
 */
export function cancelarReserva(db: BaseDeDatos, datos: z.output<typeof esquemaCancelacion>, ahora: Date = new Date()): void {
  const r = obtenerReserva(db, datos.id);
  if (!sePuedeCancelar(r.estado)) throw new ErrorDeUsuario('Solo se pueden cancelar las reservas pendientes.');
  db.$client.transaction(() => {
    db.$client.prepare(`UPDATE reservas SET estado = 'cancelada', actualizado_en = datetime('now', 'localtime') WHERE id = ?`).run(datos.id);
    if (datos.devolverSena) {
      db.$client.prepare('UPDATE pagos SET anulado = 1, anulado_en = ? WHERE reserva_id = ? AND anulado = 0').run(momentoLocal(ahora), datos.id);
    }
  })();
}

/**
 * Cambia una reserva pendiente de cancha, día u hora. Conserva el precio pactado y los pagos.
 * Si era un turno de un abono, el lugar de origen queda anotado como cancelado (así el abono
 * no lo vuelve a cargar solo) y la reserva movida pasa a ser una reserva suelta.
 */
export function moverReserva(db: BaseDeDatos, datos: z.output<typeof esquemaMover>, ahora: Date = new Date()): void {
  const r = obtenerReserva(db, datos.id);
  if (r.estado !== 'reservada') throw new ErrorDeUsuario('Solo se pueden mover las reservas pendientes.');
  const destino = obtenerCancha(db, datos.canchaId);
  if (!destino.activo) throw new ErrorDeUsuario(`${destino.nombre} está dada de baja.`);
  if (!esHorarioDeCancha(destino, datos.desde)) throw new ErrorDeUsuario(`${destino.nombre} no tiene turno a las ${datos.desde}.`);
  const origen = obtenerCancha(db, r.canchaId);
  if (destino.duracionMin !== origen.duracionMin) {
    throw new ErrorDeUsuario(`${destino.nombre} tiene turnos de ${destino.duracionMin} minutos y esta reserva es de ${origen.duracionMin}. Elegí una cancha con la misma duración.`);
  }
  const hasta = sumarMinutos(datos.desde, destino.duracionMin);
  if (datos.canchaId === r.canchaId && datos.fecha === r.fecha && datos.desde === r.desde) throw new ErrorDeUsuario('La reserva ya está en ese horario.');
  if (datos.fecha < fechaLocal(ahora) || (datos.fecha === fechaLocal(ahora) && hasta <= horaLocal(ahora))) throw new ErrorDeUsuario('Ese horario ya pasó.');
  const bloqueo = bloqueoQueCubre(db, datos.canchaId, datos.fecha, datos.desde, hasta);
  if (bloqueo) throw new ErrorDeUsuario(`${destino.nombre} está cerrada en ese horario: ${textoDelBloqueo(bloqueo)}.`);

  db.$client.transaction(() => {
    try {
      db.$client
        .prepare(`UPDATE reservas SET cancha_id = ?, fecha = ?, desde = ?, hasta = ?, abono_id = NULL, actualizado_en = datetime('now', 'localtime') WHERE id = ?`)
        .run(datos.canchaId, datos.fecha, datos.desde, hasta, datos.id);
    } catch (error) {
      if (esSuperposicion(error)) throw new ErrorDeUsuario('Ese horario ya está reservado.');
      throw error;
    }
    if (r.abonoId !== null) {
      db.$client
        .prepare(`INSERT INTO reservas (cancha_id, cliente_id, fecha, desde, hasta, estado, precio_centavos, nota, abono_id) VALUES (?, ?, ?, ?, ?, 'cancelada', ?, ?, ?)`)
        .run(r.canchaId, r.clienteId, r.fecha, r.desde, r.hasta, r.precioCentavos, 'Turno movido a otro horario', r.abonoId);
    }
  })();
}

export const textoDeSaldo = (r: Pick<Reserva, 'precioCentavos' | 'pagadoCentavos'>) => pesos(r.precioCentavos - r.pagadoCentavos);
