// Bloqueos: una cancha (o todas) cerrada por lluvia, mantenimiento, un torneo…
// Mientras dura el bloqueo no se pueden tomar reservas en ese horario.
import type { z } from 'zod';
import type { BaseDeDatos } from '../db/conexion';
import type { esquemaBloqueo, esquemaRango } from '@compartido/esquemas';
import { bloqueoCubre, type BloqueoBasico, type MotivoBloqueo, NOMBRE_MOTIVO } from '@compartido/canchas';
import type { Bloqueo, ResultadoBloqueo } from '@compartido/tipos';
import { obtenerCancha } from './canchas';
import { ErrorDeUsuario } from './errores';
import { fechaLocal, momentoLocal } from './fechas';

const SELECT = `
  SELECT b.id, b.cancha_id AS canchaId, c.nombre AS cancha, b.fecha_desde AS fechaDesde, b.fecha_hasta AS fechaHasta,
         b.desde, b.hasta, b.motivo, b.nota
    FROM bloqueos b LEFT JOIN canchas c ON c.id = b.cancha_id
   WHERE b.activo = 1`;

/** Los bloqueos que vienen o están vigentes (los que ya terminaron no se muestran). */
export function listarBloqueos(db: BaseDeDatos, ahora: Date = new Date()): Bloqueo[] {
  return db.$client.prepare(`${SELECT} AND b.fecha_hasta >= ? ORDER BY b.fecha_desde, b.desde`).all(fechaLocal(ahora)) as Bloqueo[];
}

/** Los bloqueos que tocan un rango de días (para pintar la grilla). */
export function bloqueosDelRango(db: BaseDeDatos, rango: z.output<typeof esquemaRango>): Bloqueo[] {
  return db.$client.prepare(`${SELECT} AND b.fecha_desde <= ? AND b.fecha_hasta >= ? ORDER BY b.fecha_desde`).all(rango.hasta, rango.desde) as Bloqueo[];
}

/** El bloqueo que tapa ese turno, si hay alguno. */
export function bloqueoQueCubre(db: BaseDeDatos, canchaId: number, fecha: string, desde: string, hasta: string): Bloqueo | undefined {
  const candidatos = db.$client.prepare(`${SELECT} AND b.fecha_desde <= ? AND b.fecha_hasta >= ?`).all(fecha, fecha) as Bloqueo[];
  return candidatos.find((b) => bloqueoCubre(b as BloqueoBasico, canchaId, fecha, desde, hasta));
}

/** El texto del motivo para mostrar: "Lluvia" o "Mantenimiento (pintura)". */
export const textoDelBloqueo = (b: Pick<Bloqueo, 'motivo' | 'nota'>) => (b.nota ? `${NOMBRE_MOTIVO[b.motivo as MotivoBloqueo]} (${b.nota})` : NOMBRE_MOTIVO[b.motivo as MotivoBloqueo]);

/** Las reservas pendientes que quedarían tapadas por un bloqueo. */
function reservasAfectadas(db: BaseDeDatos, datos: z.output<typeof esquemaBloqueo>): number[] {
  const filas = db.$client
    .prepare(
      `SELECT id, cancha_id AS canchaId, fecha, desde, hasta FROM reservas
        WHERE estado = 'reservada' AND fecha BETWEEN ? AND ? AND (? IS NULL OR cancha_id = ?)`,
    )
    .all(datos.fechaDesde, datos.fechaHasta, datos.canchaId, datos.canchaId) as { id: number; canchaId: number; fecha: string; desde: string; hasta: string }[];
  return filas.filter((r) => bloqueoCubre({ ...datos, canchaId: datos.canchaId }, r.canchaId, r.fecha, r.desde, r.hasta)).map((r) => r.id);
}

function revisar(db: BaseDeDatos, datos: z.output<typeof esquemaBloqueo>, ahora: Date) {
  if (datos.canchaId !== null) obtenerCancha(db, datos.canchaId);
  if (datos.fechaHasta < fechaLocal(ahora)) throw new ErrorDeUsuario('No se puede bloquear un día que ya pasó.');
}

/** Cuántas reservas se cancelarían si se crea el bloqueo (para avisar antes de confirmar). */
export function contarAfectadas(db: BaseDeDatos, datos: z.output<typeof esquemaBloqueo>, ahora: Date = new Date()): number {
  revisar(db, datos, ahora);
  return reservasAfectadas(db, datos).length;
}

export function crearBloqueo(db: BaseDeDatos, datos: z.output<typeof esquemaBloqueo>, ahora: Date = new Date()): ResultadoBloqueo {
  revisar(db, datos, ahora);
  const afectadas = reservasAfectadas(db, datos);
  if (afectadas.length && !datos.cancelarReservas) {
    throw new ErrorDeUsuario(
      `Hay ${afectadas.length} ${afectadas.length === 1 ? 'reserva' : 'reservas'} en ese horario. Elegí cancelarlas, o cambiá el horario del bloqueo.`,
    );
  }
  return db.$client.transaction(() => {
    for (const rid of afectadas) {
      db.$client.prepare(`UPDATE reservas SET estado = 'cancelada', actualizado_en = datetime('now', 'localtime') WHERE id = ?`).run(rid);
      if (datos.devolverSena) db.$client.prepare('UPDATE pagos SET anulado = 1, anulado_en = ? WHERE reserva_id = ? AND anulado = 0').run(momentoLocal(ahora), rid);
    }
    const id = Number(
      db.$client
        .prepare('INSERT INTO bloqueos (cancha_id, fecha_desde, fecha_hasta, desde, hasta, motivo, nota) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(datos.canchaId, datos.fechaDesde, datos.fechaHasta, datos.desde, datos.hasta, datos.motivo, datos.nota).lastInsertRowid,
    );
    return { id, canceladas: afectadas.length };
  })();
}

/** Levanta el bloqueo. Las reservas que se habían cancelado no vuelven solas. */
export function quitarBloqueo(db: BaseDeDatos, id: number): void {
  const r = db.$client.prepare('UPDATE bloqueos SET activo = 0 WHERE id = ? AND activo = 1').run(id);
  if (!r.changes) throw new ErrorDeUsuario('Ese bloqueo ya no existe.');
}
