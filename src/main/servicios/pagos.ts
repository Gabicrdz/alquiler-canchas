// Pagos de una reserva: la seña y el resto. Se ANULAN, no se borran.
import type { z } from 'zod';
import type { BaseDeDatos } from '../db/conexion';
import type { esquemaPago } from '@compartido/esquemas';
import { pesos } from '@compartido/dinero';
import type { Usuario } from '@compartido/tipos';
import { ErrorDeUsuario } from './errores';
import { fechaLocal, momentoLocal } from './fechas';
import { obtenerReserva } from './reservas';

export function registrarPago(db: BaseDeDatos, datos: z.output<typeof esquemaPago>, usuarioId: number, ahora: Date = new Date()): number {
  return db.$client.transaction(() => {
    const r = obtenerReserva(db, datos.reservaId);
    if (r.estado === 'cancelada' || r.estado === 'ausente') throw new ErrorDeUsuario('A esa reserva ya no se le pueden cargar pagos.');
    const saldo = r.precioCentavos - r.pagadoCentavos;
    if (saldo <= 0) throw new ErrorDeUsuario('Esa reserva ya está paga.');
    if (datos.montoCentavos > saldo) throw new ErrorDeUsuario(`Solo falta cobrar ${pesos(saldo)}.`);
    return Number(
      db.$client
        .prepare('INSERT INTO pagos (reserva_id, monto_centavos, metodo, usuario_id, creado_en) VALUES (?, ?, ?, ?, ?)')
        .run(datos.reservaId, datos.montoCentavos, datos.metodo, usuarioId, momentoLocal(ahora)).lastInsertRowid,
    );
  })();
}

/** El encargado puede anular los pagos de HOY (un error de tipeo); los de días anteriores, solo administración. */
export function anularPago(db: BaseDeDatos, id: number, quien: Pick<Usuario, 'rol'>, ahora: Date = new Date()): void {
  const p = db.$client.prepare('SELECT creado_en AS creadoEn, anulado FROM pagos WHERE id = ?').get(id) as { creadoEn: string; anulado: number } | undefined;
  if (!p) throw new ErrorDeUsuario('Ese pago ya no existe.');
  if (p.anulado === 1) throw new ErrorDeUsuario('Ese pago ya estaba anulado.');
  if (quien.rol !== 'admin' && p.creadoEn.slice(0, 10) !== fechaLocal(ahora)) {
    throw new ErrorDeUsuario('Los pagos de días anteriores los anula solo administración.');
  }
  db.$client.prepare('UPDATE pagos SET anulado = 1, anulado_en = ? WHERE id = ?').run(momentoLocal(ahora), id);
}
