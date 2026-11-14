// Los datos del complejo (nombre, dirección, seña) y los conteos para saber si el sistema está vacío.
import type { z } from 'zod';
import type { BaseDeDatos } from '../db/conexion';
import type { esquemaComplejo } from '@compartido/esquemas';
import type { Complejo, Resumen } from '@compartido/tipos';

export function obtenerComplejo(db: BaseDeDatos): Complejo {
  const filas = db.$client.prepare('SELECT clave, valor FROM configuracion').all() as { clave: string; valor: string }[];
  const c = new Map(filas.map((f) => [f.clave, f.valor]));
  return {
    nombre: c.get('nombre_complejo') ?? 'Mi Complejo',
    direccion: c.get('direccion') ?? '',
    telefono: c.get('telefono') ?? '',
    senaPorcentaje: Number(c.get('sena_porcentaje') ?? 30),
  };
}

export function guardarComplejo(db: BaseDeDatos, datos: z.output<typeof esquemaComplejo>): void {
  const guardar = db.$client.prepare('INSERT INTO configuracion (clave, valor) VALUES (?, ?) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor');
  db.$client.transaction(() => {
    guardar.run('nombre_complejo', datos.nombre);
    guardar.run('direccion', datos.direccion);
    guardar.run('telefono', datos.telefono);
    guardar.run('sena_porcentaje', String(datos.senaPorcentaje));
  })();
}

export function resumen(db: BaseDeDatos): Resumen {
  const n = (tabla: string, donde = '') => (db.$client.prepare(`SELECT count(*) AS n FROM ${tabla} ${donde}`).get() as { n: number }).n;
  return { canchas: n('canchas', 'WHERE activo = 1'), clientes: n('clientes', 'WHERE activo = 1'), reservas: n('reservas') };
}
