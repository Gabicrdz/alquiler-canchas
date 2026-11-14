import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { is } from 'drizzle-orm';
import { MIGRACIONES } from '../src/main/db/migraciones';
import { getTableConfig, SQLiteTable } from 'drizzle-orm/sqlite-core';
import * as esquema from '../src/main/db/esquema';
import { VERSION_BASE, abrirBaseDeDatos, cerrarBaseDeDatos } from '../src/main/db/conexion';
import { baseNueva, cancha, cliente } from './ayudantes';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

describe('base de datos', () => {
  it('esquema.ts (Drizzle) coincide con las tablas que crean las migraciones', () => {
    const db = baseNueva();
    const tablas = (Object.values(esquema) as unknown[]).filter((t): t is SQLiteTable => is(t, SQLiteTable));
    expect(tablas.length).toBe(9);
    for (const tabla of tablas) {
      const config = getTableConfig(tabla);
      const enLaBase = (
        db.$client.prepare(`PRAGMA table_info(${config.name})`).all() as { name: string; notnull: number; pk: number }[]
      ).map((c) => `${c.name}${c.notnull || c.pk ? '!' : ''}`);
      const enDrizzle = config.columns.map((c) => `${c.name}${c.notNull ? '!' : ''}`);
      expect(enDrizzle.sort(), config.name).toEqual(enLaBase.sort());
    }
  });

  it('una base de la etapa 1, con reservas, se actualiza sin perder nada', () => {
    const carpeta = mkdtempSync(path.join(tmpdir(), 'canchas-'));
    const ruta = path.join(carpeta, 'canchas.db');
    try {
      cerrarBaseDeDatos();
      // Se arma una base como la entregada en la etapa 1: solo la migración 1
      const vieja = new Database(ruta);
      vieja.exec(MIGRACIONES[0]!.sql);
      vieja.exec(`INSERT INTO canchas (nombre, deporte, duracion_min, apertura, cierre, precio_base_centavos) VALUES ('Cancha 1', 'futbol', 60, '15:00', '24:00', 2000000);
                  INSERT INTO clientes (nombre) VALUES ('Los Pibes');
                  INSERT INTO reservas (cancha_id, cliente_id, fecha, desde, hasta, precio_centavos) VALUES (1, 1, '2026-11-12', '20:00', '21:00', 2000000);`);
      vieja.pragma('user_version = 1');
      vieja.close();
      const db = abrirBaseDeDatos(ruta);
      expect(db.$client.pragma('user_version', { simple: true })).toBe(VERSION_BASE);
      expect(db.$client.prepare('SELECT fecha, abono_id AS abonoId FROM reservas').all()).toEqual([{ fecha: '2026-11-12', abonoId: null }]);
    } finally {
      cerrarBaseDeDatos();
      rmSync(carpeta, { recursive: true, force: true });
    }
  });

  it('las migraciones se aplican una sola vez y guardan la versión', () => {
    const carpeta = mkdtempSync(path.join(tmpdir(), 'canchas-'));
    const ruta = path.join(carpeta, 'canchas.db');
    try {
      cerrarBaseDeDatos();
      const db = abrirBaseDeDatos(ruta);
      expect(db.$client.pragma('user_version', { simple: true })).toBe(VERSION_BASE);
      cancha(db, { nombre: 'Guardada' });
      cerrarBaseDeDatos();
      const otraVez = abrirBaseDeDatos(ruta); // no debe fallar ni borrar nada
      expect(otraVez.$client.prepare('SELECT nombre FROM canchas').all()).toEqual([{ nombre: 'Guardada' }]);
      expect(otraVez.$client.pragma('foreign_keys', { simple: true })).toBe(1);
    } finally {
      cerrarBaseDeDatos();
      rmSync(carpeta, { recursive: true, force: true });
    }
  });

  it('no abre una base de una versión más nueva del programa', () => {
    const carpeta = mkdtempSync(path.join(tmpdir(), 'canchas-'));
    const ruta = path.join(carpeta, 'canchas.db');
    try {
      cerrarBaseDeDatos();
      abrirBaseDeDatos(ruta).$client.pragma(`user_version = ${VERSION_BASE + 1}`);
      cerrarBaseDeDatos();
      expect(() => abrirBaseDeDatos(ruta)).toThrow('versión más nueva');
    } finally {
      cerrarBaseDeDatos();
      rmSync(carpeta, { recursive: true, force: true });
    }
  });

  it('la base se niega a doblar una cancha aunque el programa falle (trigger)', () => {
    const db = baseNueva();
    const c = cancha(db);
    const k = cliente(db);
    const poner = (desde: string, hasta: string, estado = 'reservada') =>
      db.$client
        .prepare(`INSERT INTO reservas (cancha_id, cliente_id, fecha, desde, hasta, estado, precio_centavos) VALUES (?, ?, '2026-11-12', ?, ?, ?, 0)`)
        .run(c, k, desde, hasta, estado);
    poner('20:00', '21:00');
    expect(() => poner('20:30', '21:30')).toThrow('reserva_superpuesta');
    poner('21:00', '22:00'); // pegada: sí
    poner('20:00', '21:00', 'cancelada'); // una cancelada no ocupa
    // Y al cambiar de estado también: reactivar la cancelada chocaría
    expect(() => db.$client.prepare(`UPDATE reservas SET estado = 'reservada' WHERE estado = 'cancelada'`).run()).toThrow('reserva_superpuesta');
  });

  it('el mismo horario en otra cancha o en otro día es libre', () => {
    const db = baseNueva();
    const c1 = cancha(db);
    const c2 = cancha(db, { nombre: 'Cancha 2' });
    const k = cliente(db);
    const poner = (cancha: number, fecha: string) =>
      db.$client.prepare(`INSERT INTO reservas (cancha_id, cliente_id, fecha, desde, hasta, precio_centavos) VALUES (?, ?, ?, '20:00', '21:00', 0)`).run(cancha, k, fecha);
    poner(c1, '2026-11-12');
    poner(c2, '2026-11-12');
    poner(c1, '2026-11-13');
    expect(db.$client.prepare('SELECT count(*) AS n FROM reservas').get()).toEqual({ n: 3 });
  });
});
