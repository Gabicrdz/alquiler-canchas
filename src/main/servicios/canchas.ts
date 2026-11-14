// Canchas: deporte, duración del turno, horario y precios por franja.
import type { z } from 'zod';
import type { BaseDeDatos } from '../db/conexion';
import type { esquemaCancha } from '@compartido/esquemas';
import { esHorarioDeCancha, sumarMinutos, type Deporte, type Tarifa, type TipoDeDia } from '@compartido/canchas';
import type { Cancha } from '@compartido/tipos';
import { ErrorDeUsuario } from './errores';
import { fechaLocal } from './fechas';

interface FilaCancha {
  id: number;
  nombre: string;
  deporte: Deporte;
  detalle: string;
  techada: number;
  duracionMin: number;
  apertura: string;
  cierre: string;
  precioBaseCentavos: number;
  activo: number;
}

const SELECT = `SELECT id, nombre, deporte, detalle, techada, duracion_min AS duracionMin, apertura, cierre,
                       precio_base_centavos AS precioBaseCentavos, activo FROM canchas`;

function conTarifas(db: BaseDeDatos, filas: FilaCancha[]): Cancha[] {
  const tarifas = db.$client
    .prepare(`SELECT cancha_id AS canchaId, dias, desde, hasta, precio_centavos AS precioCentavos FROM tarifas ORDER BY desde, dias`)
    .all() as (Tarifa & { canchaId: number; dias: TipoDeDia })[];
  return filas.map((f) => ({
    ...f,
    techada: f.techada === 1,
    activo: f.activo === 1,
    tarifas: tarifas.filter((t) => t.canchaId === f.id).map(({ dias, desde, hasta, precioCentavos }) => ({ dias, desde, hasta, precioCentavos })),
  }));
}

/** Todas las canchas (también las dadas de baja); las activas primero, por deporte y nombre. */
export function listarCanchas(db: BaseDeDatos): Cancha[] {
  const filas = db.$client.prepare(`${SELECT} ORDER BY activo DESC, deporte, nombre COLLATE NOCASE`).all() as FilaCancha[];
  return conTarifas(db, filas);
}

export function obtenerCancha(db: BaseDeDatos, id: number): Cancha {
  const fila = db.$client.prepare(`${SELECT} WHERE id = ?`).get(id) as FilaCancha | undefined;
  if (!fila) throw new ErrorDeUsuario('Esa cancha ya no existe.');
  return conTarifas(db, [fila])[0]!;
}

/** Reservas pendientes de hoy en adelante: son las que se rompen si la cancha cambia. */
function pendientesFuturas(db: BaseDeDatos, canchaId: number, hoy: string) {
  return db.$client
    .prepare(`SELECT desde, hasta FROM reservas WHERE cancha_id = ? AND fecha >= ? AND estado = 'reservada'`)
    .all(canchaId, hoy) as { desde: string; hasta: string }[];
}

export function guardarCancha(db: BaseDeDatos, datos: z.output<typeof esquemaCancha>, ahora: Date = new Date()): number {
  return db.$client.transaction(() => {
    const repetida = db.$client.prepare('SELECT 1 FROM canchas WHERE nombre = ? COLLATE NOCASE AND id IS NOT ?').get(datos.nombre, datos.id ?? null);
    if (repetida) throw new ErrorDeUsuario(`Ya hay una cancha que se llama "${datos.nombre}".`);

    let id = datos.id;
    if (id === undefined) {
      id = Number(
        db.$client
          .prepare(
            `INSERT INTO canchas (nombre, deporte, detalle, techada, duracion_min, apertura, cierre, precio_base_centavos) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(datos.nombre, datos.deporte, datos.detalle, datos.techada ? 1 : 0, datos.duracionMin, datos.apertura, datos.cierre, datos.precioBaseCentavos)
          .lastInsertRowid,
      );
    } else {
      obtenerCancha(db, id);
      // Si cambia el horario o la duración, las reservas que ya están dadas tienen que seguir encajando
      const futuras = pendientesFuturas(db, id, fechaLocal(ahora));
      const noEncajan = futuras.filter((r) => !esHorarioDeCancha(datos, r.desde) || r.hasta !== sumarMinutos(r.desde, datos.duracionMin));
      if (noEncajan.length) {
        throw new ErrorDeUsuario(
          `Hay ${noEncajan.length === 1 ? '1 reserva' : `${noEncajan.length} reservas`} pendientes que no encajan con ese horario o esa duración. Cancelalas primero.`,
        );
      }
      db.$client
        .prepare(
          `UPDATE canchas SET nombre = ?, deporte = ?, detalle = ?, techada = ?, duracion_min = ?, apertura = ?, cierre = ?, precio_base_centavos = ? WHERE id = ?`,
        )
        .run(datos.nombre, datos.deporte, datos.detalle, datos.techada ? 1 : 0, datos.duracionMin, datos.apertura, datos.cierre, datos.precioBaseCentavos, id);
      db.$client.prepare('DELETE FROM tarifas WHERE cancha_id = ?').run(id);
    }
    const poner = db.$client.prepare('INSERT INTO tarifas (cancha_id, dias, desde, hasta, precio_centavos) VALUES (?, ?, ?, ?, ?)');
    for (const t of datos.tarifas) poner.run(id, t.dias, t.desde, t.hasta, t.precioCentavos);
    return id;
  })();
}

export function cambiarActivoCancha(db: BaseDeDatos, id: number, activo: boolean, ahora: Date = new Date()): void {
  obtenerCancha(db, id);
  if (!activo) {
    const n = pendientesFuturas(db, id, fechaLocal(ahora)).length;
    if (n) throw new ErrorDeUsuario(`Tiene ${n === 1 ? '1 reserva pendiente' : `${n} reservas pendientes`}. Cancelalas primero.`);
  }
  db.$client.prepare('UPDATE canchas SET activo = ? WHERE id = ?').run(activo ? 1 : 0, id);
}
