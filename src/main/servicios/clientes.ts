// Clientes: quién reserva (una persona o un equipo).
import type { z } from 'zod';
import type { BaseDeDatos } from '../db/conexion';
import type { esquemaBuscarClientes, esquemaCliente } from '@compartido/esquemas';
import type { Cliente } from '@compartido/tipos';
import { ErrorDeUsuario } from './errores';
import { fechaLocal } from './fechas';
import { escaparLike, normalizar } from './texto';

const busquedaDe = (nombre: string, telefono: string) => normalizar(`${nombre} ${telefono.replace(/\D/g, '')}`);

interface Fila extends Omit<Cliente, 'activo'> {
  activo: number;
}

export function buscarClientes(db: BaseDeDatos, filtro: z.output<typeof esquemaBuscarClientes>): Cliente[] {
  const palabras = normalizar(filtro.texto).split(/\s+/).filter(Boolean);
  const donde = palabras.map(() => `c.busqueda LIKE ? ESCAPE '\\'`);
  if (!filtro.incluirBajas) donde.push('c.activo = 1');
  const filas = db.$client
    .prepare(
      `SELECT c.id, c.nombre, c.telefono, c.notas, c.activo,
              (SELECT count(*) FROM reservas r WHERE r.cliente_id = c.id AND r.estado <> 'cancelada') AS reservas
         FROM clientes c
        ${donde.length ? `WHERE ${donde.join(' AND ')}` : ''}
        ORDER BY c.activo DESC, c.nombre COLLATE NOCASE
        LIMIT 300`,
    )
    .all(...palabras.map((p) => `%${escaparLike(p)}%`)) as Fila[];
  return filas.map((f) => ({ ...f, activo: f.activo === 1 }));
}

export function guardarCliente(db: BaseDeDatos, datos: z.output<typeof esquemaCliente>): number {
  const busqueda = busquedaDe(datos.nombre, datos.telefono);
  if (datos.id === undefined) {
    return Number(
      db.$client.prepare('INSERT INTO clientes (nombre, telefono, notas, busqueda) VALUES (?, ?, ?, ?)').run(datos.nombre, datos.telefono, datos.notas, busqueda).lastInsertRowid,
    );
  }
  const r = db.$client
    .prepare(`UPDATE clientes SET nombre = ?, telefono = ?, notas = ?, busqueda = ?, actualizado_en = datetime('now', 'localtime') WHERE id = ?`)
    .run(datos.nombre, datos.telefono, datos.notas, busqueda, datos.id);
  if (r.changes === 0) throw new ErrorDeUsuario('Ese cliente ya no existe.');
  return datos.id;
}

export function cambiarActivoCliente(db: BaseDeDatos, id: number, activo: boolean, ahora: Date = new Date()): void {
  if (!activo) {
    const n = (
      db.$client.prepare(`SELECT count(*) AS n FROM reservas WHERE cliente_id = ? AND fecha >= ? AND estado = 'reservada'`).get(id, fechaLocal(ahora)) as { n: number }
    ).n;
    if (n) throw new ErrorDeUsuario(`Tiene ${n === 1 ? '1 reserva pendiente' : `${n} reservas pendientes`}. Cancelalas primero.`);
  }
  const r = db.$client.prepare('UPDATE clientes SET activo = ? WHERE id = ?').run(activo ? 1 : 0, id);
  if (r.changes === 0) throw new ErrorDeUsuario('Ese cliente ya no existe.');
}
