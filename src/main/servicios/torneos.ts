// Torneos: equipos que se inscriben (y pagan), fixture todos contra todos,
// resultados y tabla de posiciones.
//
// La tabla de posiciones NO se guarda: se calcula cada vez desde los resultados
// (3 puntos por ganar, 1 por empatar). Así nunca queda desactualizada.
import type { z } from 'zod';
import type { BaseDeDatos } from '../db/conexion';
import type { esquemaEquipo, esquemaFixture, esquemaPagoEquipo, esquemaProgramar, esquemaResultado, esquemaTorneo } from '@compartido/esquemas';
import { estadoDePago } from '@compartido/canchas';
import { pesos } from '@compartido/dinero';
import type { DetalleTorneo, Equipo, PagoDeReserva, Partido, Posicion, Torneo, Usuario } from '@compartido/tipos';
import { obtenerCancha } from './canchas';
import { crearBloqueo, quitarBloqueo } from './bloqueos';
import { ErrorDeUsuario } from './errores';
import { fechaLocal, momentoLocal } from './fechas';

type FilaTorneo = Omit<Torneo, 'cobradoCentavos'> & { cobradoCentavos: number };

const SELECT = `
  SELECT t.id, t.nombre, t.deporte, t.fecha_desde AS fechaDesde, t.fecha_hasta AS fechaHasta, t.cuota_centavos AS cuotaCentavos,
         t.estado, t.nota, t.bloqueo_id AS bloqueoId,
         (SELECT count(*) FROM torneo_equipos e WHERE e.torneo_id = t.id AND e.activo = 1) AS equipos,
         (SELECT count(*) FROM torneo_partidos p WHERE p.torneo_id = t.id) AS partidos,
         (SELECT count(*) FROM torneo_partidos p WHERE p.torneo_id = t.id AND p.goles_local IS NOT NULL) AS partidosJugados,
         COALESCE((SELECT SUM(g.monto_centavos) FROM torneo_pagos g JOIN torneo_equipos e ON e.id = g.equipo_id
                    WHERE e.torneo_id = t.id AND e.activo = 1 AND g.anulado = 0), 0) AS cobradoCentavos
    FROM torneos t WHERE t.activo = 1`;

/** Los torneos que no se dieron de baja: primero los que están en marcha, después los más nuevos. */
export function listarTorneos(db: BaseDeDatos): Torneo[] {
  return db.$client
    .prepare(`${SELECT} ORDER BY CASE t.estado WHEN 'terminado' THEN 1 ELSE 0 END, t.fecha_desde DESC, t.id DESC`)
    .all() as FilaTorneo[];
}

function torneoActivo(db: BaseDeDatos, id: number): Torneo {
  const t = db.$client.prepare(`${SELECT} AND t.id = ?`).get(id) as Torneo | undefined;
  if (!t) throw new ErrorDeUsuario('Ese torneo ya no existe.');
  return t;
}

export function equiposDelTorneo(db: BaseDeDatos, torneoId: number, cuotaCentavos: number): Equipo[] {
  const equipos = db.$client.prepare('SELECT id, nombre, telefono FROM torneo_equipos WHERE torneo_id = ? AND activo = 1 ORDER BY nombre COLLATE NOCASE').all(torneoId) as Pick<Equipo, 'id' | 'nombre' | 'telefono'>[];
  const pagos = db.$client
    .prepare(
      `SELECT g.id, g.equipo_id AS equipoId, g.monto_centavos AS montoCentavos, g.metodo, u.nombre AS usuario, g.creado_en AS creadoEn
         FROM torneo_pagos g JOIN torneo_equipos e ON e.id = g.equipo_id LEFT JOIN usuarios u ON u.id = g.usuario_id
        WHERE e.torneo_id = ? AND g.anulado = 0 ORDER BY g.id`,
    )
    .all(torneoId) as (PagoDeReserva & { equipoId: number })[];
  return equipos.map((e) => {
    const propios = pagos.filter((p) => p.equipoId === e.id).map(({ equipoId: _e, ...p }) => p);
    const pagado = propios.reduce((s, p) => s + p.montoCentavos, 0);
    return { ...e, pagos: propios, pagadoCentavos: pagado, estadoDePago: estadoDePago(cuotaCentavos, pagado) };
  });
}

export function partidosDelTorneo(db: BaseDeDatos, torneoId: number): Partido[] {
  return db.$client
    .prepare(
      `SELECT p.id, p.ronda, p.local_id AS localId, p.visitante_id AS visitanteId, l.nombre AS local, v.nombre AS visitante,
              p.fecha, p.hora, p.cancha_id AS canchaId, c.nombre AS cancha, p.goles_local AS golesLocal, p.goles_visitante AS golesVisitante
         FROM torneo_partidos p
         JOIN torneo_equipos l ON l.id = p.local_id JOIN torneo_equipos v ON v.id = p.visitante_id
         LEFT JOIN canchas c ON c.id = p.cancha_id
        WHERE p.torneo_id = ? ORDER BY p.ronda, p.id`,
    )
    .all(torneoId) as Partido[];
}

/** La tabla: 3 puntos por ganar, 1 por empatar; desempata la diferencia de gol y después los goles a favor. */
export function calcularPosiciones(equipos: Pick<Equipo, 'id' | 'nombre'>[], partidos: Pick<Partido, 'localId' | 'visitanteId' | 'golesLocal' | 'golesVisitante'>[]): Posicion[] {
  const tabla = new Map<number, Posicion>(equipos.map((e) => [e.id, { equipoId: e.id, nombre: e.nombre, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dg: 0, pts: 0 }]));
  for (const p of partidos) {
    if (p.golesLocal === null || p.golesVisitante === null) continue;
    const l = tabla.get(p.localId);
    const v = tabla.get(p.visitanteId);
    if (!l || !v) continue;
    for (const [a, b, ga, gb] of [[l, v, p.golesLocal, p.golesVisitante], [v, l, p.golesVisitante, p.golesLocal]] as const) {
      a.pj++;
      a.gf += ga;
      a.gc += gb;
      if (ga > gb) {
        a.pg++;
        a.pts += 3;
      } else if (ga === gb) {
        a.pe++;
        a.pts += 1;
      } else a.pp++;
      b.dg = b.gf - b.gc;
      a.dg = a.gf - a.gc;
    }
  }
  return [...tabla.values()].sort((a, b) => b.pts - a.pts || b.dg - a.dg || b.gf - a.gf || a.nombre.localeCompare(b.nombre));
}

export function obtenerTorneo(db: BaseDeDatos, id: number): DetalleTorneo {
  const t = torneoActivo(db, id);
  const listaDeEquipos = equiposDelTorneo(db, id, t.cuotaCentavos);
  const listaDePartidos = partidosDelTorneo(db, id);
  return { ...t, listaDeEquipos, listaDePartidos, posiciones: calcularPosiciones(listaDeEquipos, listaDePartidos) };
}

export function crearTorneo(db: BaseDeDatos, datos: z.output<typeof esquemaTorneo>, ahora: Date = new Date()): number {
  if (datos.bloquear && datos.bloqueoCanchaId !== null) obtenerCancha(db, datos.bloqueoCanchaId);
  return db.$client.transaction(() => {
    // El bloqueo se crea primero: si hay reservas en el medio y no se eligió cancelarlas, falla y no queda nada a medias.
    const bloqueoId = datos.bloquear
      ? crearBloqueo(
          db,
          {
            canchaId: datos.bloqueoCanchaId,
            fechaDesde: datos.fechaDesde,
            fechaHasta: datos.fechaHasta,
            desde: null,
            hasta: null,
            motivo: 'torneo',
            nota: datos.nombre,
            cancelarReservas: datos.cancelarReservas,
            devolverSena: datos.devolverSena,
          },
          ahora,
        ).id
      : null;
    return Number(
      db.$client
        .prepare('INSERT INTO torneos (nombre, deporte, fecha_desde, fecha_hasta, cuota_centavos, nota, bloqueo_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(datos.nombre, datos.deporte, datos.fechaDesde, datos.fechaHasta, datos.cuotaCentavos, datos.nota, bloqueoId).lastInsertRowid,
    );
  })();
}

/** Da de baja el torneo y levanta el bloqueo de canchas que había creado. */
export function cancelarTorneo(db: BaseDeDatos, id: number): void {
  const t = torneoActivo(db, id);
  db.$client.transaction(() => {
    db.$client.prepare('UPDATE torneos SET activo = 0 WHERE id = ?').run(id);
    if (t.bloqueoId !== null) {
      try {
        quitarBloqueo(db, t.bloqueoId);
      } catch {
        /* ya lo habían quitado desde Abonos: no pasa nada */
      }
    }
  })();
}

function equipoDe(db: BaseDeDatos, equipoId: number) {
  const e = db.$client.prepare('SELECT id, torneo_id AS torneoId, nombre FROM torneo_equipos WHERE id = ? AND activo = 1').get(equipoId) as { id: number; torneoId: number; nombre: string } | undefined;
  if (!e) throw new ErrorDeUsuario('Ese equipo ya no está en el torneo.');
  return e;
}

export function agregarEquipo(db: BaseDeDatos, datos: z.output<typeof esquemaEquipo>): number {
  const t = torneoActivo(db, datos.torneoId);
  if (t.estado !== 'inscripcion') throw new ErrorDeUsuario('Las inscripciones ya cerraron: el fixture está armado.');
  const repetido = db.$client.prepare('SELECT 1 FROM torneo_equipos WHERE torneo_id = ? AND activo = 1 AND nombre = ? COLLATE NOCASE').get(datos.torneoId, datos.nombre);
  if (repetido) throw new ErrorDeUsuario('Ya hay un equipo con ese nombre en el torneo.');
  return Number(db.$client.prepare('INSERT INTO torneo_equipos (torneo_id, nombre, telefono) VALUES (?, ?, ?)').run(datos.torneoId, datos.nombre, datos.telefono).lastInsertRowid);
}

/** Saca un equipo (solo mientras se inscriben). Lo que había pagado queda anulado: se le devuelve. */
export function quitarEquipo(db: BaseDeDatos, equipoId: number, ahora: Date = new Date()): void {
  const e = equipoDe(db, equipoId);
  if (torneoActivo(db, e.torneoId).estado !== 'inscripcion') throw new ErrorDeUsuario('Con el fixture armado ya no se pueden sacar equipos.');
  db.$client.transaction(() => {
    db.$client.prepare('UPDATE torneo_equipos SET activo = 0 WHERE id = ?').run(equipoId);
    db.$client.prepare('UPDATE torneo_pagos SET anulado = 1, anulado_en = ? WHERE equipo_id = ? AND anulado = 0').run(momentoLocal(ahora), equipoId);
  })();
}

export function cobrarEquipo(db: BaseDeDatos, datos: z.output<typeof esquemaPagoEquipo>, usuarioId: number | null, ahora: Date = new Date()): number {
  return db.$client.transaction(() => {
    const e = equipoDe(db, datos.equipoId);
    const t = torneoActivo(db, e.torneoId);
    if (t.cuotaCentavos <= 0) throw new ErrorDeUsuario('Este torneo no tiene cuota de inscripción.');
    const pagado = (db.$client.prepare('SELECT COALESCE(SUM(monto_centavos), 0) AS n FROM torneo_pagos WHERE equipo_id = ? AND anulado = 0').get(e.id) as { n: number }).n;
    const saldo = t.cuotaCentavos - pagado;
    if (saldo <= 0) throw new ErrorDeUsuario(`${e.nombre} ya pagó la inscripción.`);
    if (datos.montoCentavos > saldo) throw new ErrorDeUsuario(`Solo falta cobrar ${pesos(saldo)}.`);
    return Number(
      db.$client
        .prepare('INSERT INTO torneo_pagos (equipo_id, monto_centavos, metodo, usuario_id, creado_en) VALUES (?, ?, ?, ?, ?)')
        .run(e.id, datos.montoCentavos, datos.metodo, usuarioId, momentoLocal(ahora)).lastInsertRowid,
    );
  })();
}

/** Igual que en las reservas: el encargado anula los pagos de hoy; los de días anteriores, administración. */
export function anularPagoEquipo(db: BaseDeDatos, pagoId: number, quien: Pick<Usuario, 'rol'>, ahora: Date = new Date()): void {
  const p = db.$client.prepare('SELECT creado_en AS creadoEn, anulado FROM torneo_pagos WHERE id = ?').get(pagoId) as { creadoEn: string; anulado: number } | undefined;
  if (!p) throw new ErrorDeUsuario('Ese pago ya no existe.');
  if (p.anulado === 1) throw new ErrorDeUsuario('Ese pago ya estaba anulado.');
  if (quien.rol !== 'admin' && p.creadoEn.slice(0, 10) !== fechaLocal(ahora)) throw new ErrorDeUsuario('Los pagos de días anteriores los anula solo administración.');
  db.$client.prepare('UPDATE torneo_pagos SET anulado = 1, anulado_en = ? WHERE id = ?').run(momentoLocal(ahora), pagoId);
}

/**
 * Todos contra todos con el "método del círculo": un equipo queda fijo y los demás
 * rotan. Con cantidad impar se suma un "libre" (el que le toca descansa esa ronda).
 * Devuelve las rondas, cada una con sus cruces [local, visitante].
 */
export function armarRondas(ids: number[], idaYVuelta: boolean): [number, number][][] {
  const lista: (number | null)[] = [...ids];
  if (lista.length % 2 === 1) lista.push(null);
  const n = lista.length;
  const rondas: [number, number][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const cruces: [number, number][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = lista[i]!;
      const b = lista[n - 1 - i]!;
      if (a === null || b === null) continue;
      // Se alterna quién es local para que a nadie le toque siempre de local
      cruces.push((r + i) % 2 === 0 ? [a, b] : [b, a]);
    }
    rondas.push(cruces);
    lista.splice(1, 0, lista.pop()!); // rota todos menos el primero
  }
  return idaYVuelta ? [...rondas, ...rondas.map((cruces) => cruces.map(([a, b]) => [b, a] as [number, number]))] : rondas;
}

export function generarFixture(db: BaseDeDatos, datos: z.output<typeof esquemaFixture>): number {
  const t = torneoActivo(db, datos.torneoId);
  if (t.estado !== 'inscripcion') throw new ErrorDeUsuario('Este torneo ya tiene el fixture armado.');
  const equipos = db.$client.prepare('SELECT id FROM torneo_equipos WHERE torneo_id = ? AND activo = 1 ORDER BY id').all(t.id) as { id: number }[];
  if (equipos.length < 3) throw new ErrorDeUsuario('Para armar el fixture hacen falta al menos 3 equipos.');
  const rondas = armarRondas(equipos.map((e) => e.id), datos.idaYVuelta);
  return db.$client.transaction(() => {
    const insertar = db.$client.prepare('INSERT INTO torneo_partidos (torneo_id, ronda, local_id, visitante_id) VALUES (?, ?, ?, ?)');
    let n = 0;
    rondas.forEach((cruces, i) =>
      cruces.forEach(([l, v]) => {
        insertar.run(t.id, i + 1, l, v);
        n++;
      }),
    );
    db.$client.prepare(`UPDATE torneos SET estado = 'en_juego' WHERE id = ?`).run(t.id);
    return n;
  })();
}

function partidoEnJuego(db: BaseDeDatos, partidoId: number) {
  const p = db.$client
    .prepare('SELECT p.id, p.torneo_id AS torneoId FROM torneo_partidos p JOIN torneos t ON t.id = p.torneo_id WHERE p.id = ? AND t.activo = 1')
    .get(partidoId) as { id: number; torneoId: number } | undefined;
  if (!p) throw new ErrorDeUsuario('Ese partido ya no existe.');
  const t = torneoActivo(db, p.torneoId);
  if (t.estado !== 'en_juego') throw new ErrorDeUsuario(t.estado === 'terminado' ? 'El torneo ya terminó.' : 'Primero hay que armar el fixture.');
  return { ...p, torneo: t };
}

export function programarPartido(db: BaseDeDatos, datos: z.output<typeof esquemaProgramar>): void {
  const p = partidoEnJuego(db, datos.partidoId);
  if (datos.fecha !== null && (datos.fecha < p.torneo.fechaDesde || datos.fecha > p.torneo.fechaHasta)) {
    throw new ErrorDeUsuario('El partido tiene que ser dentro de las fechas del torneo.');
  }
  if (datos.canchaId !== null) obtenerCancha(db, datos.canchaId);
  db.$client.prepare('UPDATE torneo_partidos SET fecha = ?, hora = ?, cancha_id = ? WHERE id = ?').run(datos.fecha, datos.hora, datos.canchaId, datos.partidoId);
}

/** Carga (o borra, con null) el resultado de un partido. */
export function cargarResultado(db: BaseDeDatos, datos: z.output<typeof esquemaResultado>): void {
  partidoEnJuego(db, datos.partidoId);
  db.$client.prepare('UPDATE torneo_partidos SET goles_local = ?, goles_visitante = ? WHERE id = ?').run(datos.golesLocal, datos.golesVisitante, datos.partidoId);
}

export function terminarTorneo(db: BaseDeDatos, id: number): void {
  const t = torneoActivo(db, id);
  if (t.estado !== 'en_juego') throw new ErrorDeUsuario(t.estado === 'terminado' ? 'El torneo ya estaba terminado.' : 'Todavía no se armó el fixture.');
  const faltan = t.partidos - t.partidosJugados;
  if (faltan > 0) throw new ErrorDeUsuario(`Faltan cargar ${faltan} ${faltan === 1 ? 'resultado' : 'resultados'}.`);
  db.$client.prepare(`UPDATE torneos SET estado = 'terminado' WHERE id = ?`).run(id);
}
