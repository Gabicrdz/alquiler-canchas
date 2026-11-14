import { describe, expect, it } from 'vitest';
import {
  esquemaEquipo,
  esquemaFixture,
  esquemaPagoEquipo,
  esquemaProgramar,
  esquemaResultado,
  esquemaTorneo,
} from '../src/compartido/esquemas';
import { bloqueoQueCubre, listarBloqueos } from '../src/main/servicios/bloqueos';
import { reservasDelRango } from '../src/main/servicios/reservas';
import {
  agregarEquipo,
  anularPagoEquipo,
  armarRondas,
  calcularPosiciones,
  cancelarTorneo,
  cargarResultado,
  cobrarEquipo,
  crearTorneo,
  generarFixture,
  listarTorneos,
  obtenerTorneo,
  programarPartido,
  quitarEquipo,
  terminarTorneo,
} from '../src/main/servicios/torneos';
import { AHORA, HOY, MANANA, SABADO, baseNueva, cancha, cliente, reservar, usuario } from './ayudantes';

const torneo = (db: ReturnType<typeof baseNueva>, datos: Record<string, unknown> = {}) =>
  crearTorneo(db, esquemaTorneo.parse({ nombre: 'Copa Verano', deporte: 'futbol', fechaDesde: SABADO, fechaHasta: '2026-11-15', cuotaCentavos: 2_000_000, ...datos }), AHORA);
const equipo = (db: ReturnType<typeof baseNueva>, torneoId: number, nombre: string) => agregarEquipo(db, esquemaEquipo.parse({ torneoId, nombre }));
const con = (db: ReturnType<typeof baseNueva>, n: number, datos: Record<string, unknown> = {}) => {
  const t = torneo(db, datos);
  const equipos = Array.from({ length: n }, (_, i) => equipo(db, t, `Equipo ${i + 1}`));
  return { t, equipos };
};

describe('fixture (todos contra todos)', () => {
  it('con cantidad par: cada pareja se enfrenta una sola vez y nadie juega dos veces en una ronda', () => {
    const rondas = armarRondas([1, 2, 3, 4], false);
    expect(rondas).toHaveLength(3);
    const cruces = rondas.flat().map(([a, b]) => [a, b].sort().join('-'));
    expect(cruces).toHaveLength(6);
    expect(new Set(cruces).size).toBe(6);
    for (const ronda of rondas) expect(new Set(ronda.flat()).size).toBe(ronda.length * 2);
  });
  it('con cantidad impar: alguien descansa en cada ronda', () => {
    const rondas = armarRondas([1, 2, 3, 4, 5], false);
    expect(rondas).toHaveLength(5);
    expect(rondas.flat()).toHaveLength(10);
    for (const ronda of rondas) expect(ronda).toHaveLength(2);
  });
  it('ida y vuelta duplica los partidos y da vuelta la localía', () => {
    const rondas = armarRondas([1, 2, 3, 4], true);
    expect(rondas).toHaveLength(6);
    const ida = rondas.slice(0, 3).flat();
    const vuelta = rondas.slice(3).flat();
    expect(vuelta).toEqual(ida.map(([a, b]) => [b, a]));
  });
});

describe('tabla de posiciones', () => {
  const equipos = [
    { id: 1, nombre: 'Atlético' },
    { id: 2, nombre: 'Boca Sur' },
    { id: 3, nombre: 'Central' },
  ];
  it('3 puntos por ganar, 1 por empatar; desempata la diferencia de gol', () => {
    const t = calcularPosiciones(equipos, [
      { localId: 1, visitanteId: 2, golesLocal: 3, golesVisitante: 0 },
      { localId: 2, visitanteId: 3, golesLocal: 1, golesVisitante: 1 },
      { localId: 3, visitanteId: 1, golesLocal: 0, golesVisitante: 0 },
    ]);
    expect(t.map((x) => [x.nombre, x.pts, x.dg])).toEqual([
      ['Atlético', 4, 3],
      ['Central', 2, 0],
      ['Boca Sur', 1, -3],
    ]);
    expect(t[0]).toMatchObject({ pj: 2, pg: 1, pe: 1, pp: 0, gf: 3, gc: 0 });
  });
  it('los partidos sin resultado no suman', () => {
    const t = calcularPosiciones(equipos, [{ localId: 1, visitanteId: 2, golesLocal: null, golesVisitante: null }]);
    expect(t.every((x) => x.pj === 0 && x.pts === 0)).toBe(true);
  });
});

describe('torneo: inscripción y pagos', () => {
  it('se crea, se inscriben equipos y no se repiten nombres', () => {
    const db = baseNueva();
    const { t } = con(db, 3);
    const d = obtenerTorneo(db, t);
    expect(d).toMatchObject({ nombre: 'Copa Verano', estado: 'inscripcion', equipos: 3, cuotaCentavos: 2_000_000 });
    expect(() => equipo(db, t, 'equipo 1')).toThrow('Ya hay un equipo');
    expect(listarTorneos(db)).toHaveLength(1);
  });
  it('cobra la inscripción en partes y avisa si se pasa', () => {
    const db = baseNueva();
    const u = usuario(db);
    const { t, equipos } = con(db, 3);
    const pagar = (monto: number) => cobrarEquipo(db, esquemaPagoEquipo.parse({ equipoId: equipos[0], montoCentavos: monto, metodo: 'efectivo' }), u, AHORA);
    pagar(500_000);
    expect(obtenerTorneo(db, t).listaDeEquipos.find((e) => e.id === equipos[0])).toMatchObject({ pagadoCentavos: 500_000, estadoDePago: 'sena' });
    expect(() => pagar(2_000_000)).toThrow('Solo falta cobrar $ 15.000');
    pagar(1_500_000);
    expect(obtenerTorneo(db, t)).toMatchObject({ cobradoCentavos: 2_000_000 });
    expect(() => pagar(100)).toThrow('ya pagó');
  });
  it('un torneo gratis no cobra, y quitar un equipo devuelve lo que pagó', () => {
    const db = baseNueva();
    const u = usuario(db);
    const gratis = con(db, 1, { cuotaCentavos: 0, nombre: 'Gratis' });
    expect(() => cobrarEquipo(db, esquemaPagoEquipo.parse({ equipoId: gratis.equipos[0], montoCentavos: 100, metodo: 'efectivo' }), u, AHORA)).toThrow('no tiene cuota');
    const { t, equipos } = con(db, 2);
    cobrarEquipo(db, esquemaPagoEquipo.parse({ equipoId: equipos[1], montoCentavos: 1_000_000, metodo: 'transferencia' }), u, AHORA);
    quitarEquipo(db, equipos[1]!, AHORA);
    expect(obtenerTorneo(db, t)).toMatchObject({ equipos: 1, cobradoCentavos: 0 });
  });
  it('el encargado solo anula pagos de hoy', () => {
    const db = baseNueva();
    const u = usuario(db);
    const { equipos } = con(db, 1);
    const pago = cobrarEquipo(db, esquemaPagoEquipo.parse({ equipoId: equipos[0], montoCentavos: 500_000, metodo: 'efectivo' }), u, AHORA);
    expect(() => anularPagoEquipo(db, pago, { rol: 'encargado' }, new Date(2026, 10, 13, 12))).toThrow('solo administración');
    anularPagoEquipo(db, pago, { rol: 'encargado' }, AHORA);
    expect(() => anularPagoEquipo(db, pago, { rol: 'admin' }, AHORA)).toThrow('ya estaba anulado');
  });
});

describe('torneo: fixture y resultados', () => {
  it('hacen falta 3 equipos; al armarlo se cierran las inscripciones', () => {
    const db = baseNueva();
    const { t } = con(db, 2);
    expect(() => generarFixture(db, esquemaFixture.parse({ torneoId: t }))).toThrow('al menos 3');
    equipo(db, t, 'Equipo 3');
    expect(generarFixture(db, esquemaFixture.parse({ torneoId: t }))).toBe(3);
    expect(obtenerTorneo(db, t)).toMatchObject({ estado: 'en_juego', partidos: 3 });
    expect(() => equipo(db, t, 'Tarde')).toThrow('cerraron');
    expect(() => quitarEquipo(db, 1)).toThrow('ya no se pueden sacar');
    expect(() => generarFixture(db, esquemaFixture.parse({ torneoId: t }))).toThrow('ya tiene el fixture');
  });
  it('programa partidos dentro de las fechas del torneo y carga resultados', () => {
    const db = baseNueva();
    const c = cancha(db);
    const { t } = con(db, 3);
    expect(() => programarPartido(db, esquemaProgramar.parse({ partidoId: 1, fecha: SABADO, hora: '16:00', canchaId: c }))).toThrow('ya no existe');
    generarFixture(db, esquemaFixture.parse({ torneoId: t }));
    programarPartido(db, esquemaProgramar.parse({ partidoId: 1, fecha: SABADO, hora: '16:00', canchaId: c }));
    expect(obtenerTorneo(db, t).listaDePartidos[0]).toMatchObject({ fecha: SABADO, hora: '16:00', cancha: 'Cancha 1' });
    expect(() => programarPartido(db, esquemaProgramar.parse({ partidoId: 1, fecha: '2026-12-01', hora: '16:00', canchaId: c }))).toThrow('dentro de las fechas');
    cargarResultado(db, esquemaResultado.parse({ partidoId: 1, golesLocal: 2, golesVisitante: 1 }));
    expect(obtenerTorneo(db, t)).toMatchObject({ partidosJugados: 1 });
    cargarResultado(db, esquemaResultado.parse({ partidoId: 1, golesLocal: null, golesVisitante: null }));
    expect(obtenerTorneo(db, t)).toMatchObject({ partidosJugados: 0 });
    expect(() => esquemaResultado.parse({ partidoId: 1, golesLocal: 2, golesVisitante: null })).toThrow('goles de los dos');
  });
  it('no se termina hasta cargar todos los resultados', () => {
    const db = baseNueva();
    const { t } = con(db, 3);
    expect(() => terminarTorneo(db, t)).toThrow('Todavía no se armó');
    generarFixture(db, esquemaFixture.parse({ torneoId: t }));
    cargarResultado(db, esquemaResultado.parse({ partidoId: 1, golesLocal: 1, golesVisitante: 0 }));
    expect(() => terminarTorneo(db, t)).toThrow('Faltan cargar 2 resultados');
    cargarResultado(db, esquemaResultado.parse({ partidoId: 2, golesLocal: 1, golesVisitante: 1 }));
    cargarResultado(db, esquemaResultado.parse({ partidoId: 3, golesLocal: 0, golesVisitante: 2 }));
    terminarTorneo(db, t);
    expect(obtenerTorneo(db, t).estado).toBe('terminado');
    expect(() => cargarResultado(db, esquemaResultado.parse({ partidoId: 3, golesLocal: 5, golesVisitante: 5 }))).toThrow('ya terminó');
  });
});

describe('torneo y bloqueo de canchas', () => {
  it('cierra las canchas mientras dura y las libera al cancelarlo', () => {
    const db = baseNueva();
    const c = cancha(db);
    const t = torneo(db, { bloquear: true });
    expect(bloqueoQueCubre(db, c, SABADO, '18:00', '19:00')).toMatchObject({ motivo: 'torneo', nota: 'Copa Verano' });
    expect(obtenerTorneo(db, t).bloqueoId).not.toBeNull();
    cancelarTorneo(db, t);
    expect(listarTorneos(db)).toHaveLength(0);
    expect(bloqueoQueCubre(db, c, SABADO, '18:00', '19:00')).toBe(undefined);
    expect(listarBloqueos(db, AHORA)).toHaveLength(0);
  });
  it('si hay reservas en esos días hay que elegir cancelarlas; si no, no se crea nada', () => {
    const db = baseNueva();
    const c = cancha(db);
    const u = usuario(db);
    reservar(db, { canchaId: c, clienteId: cliente(db), fecha: SABADO, desde: '20:00' }, u);
    expect(() => torneo(db, { bloquear: true })).toThrow('1 reserva');
    expect(listarTorneos(db)).toHaveLength(0);
    torneo(db, { bloquear: true, cancelarReservas: true });
    expect(reservasDelRango(db, { desde: SABADO, hasta: SABADO })).toHaveLength(0);
    expect(MANANA).toBeDefined();
    expect(HOY).toBeDefined();
  });
  it('valida las fechas del torneo', () => {
    expect(() => esquemaTorneo.parse({ nombre: 'X1', deporte: 'futbol', fechaDesde: '2026-11-15', fechaHasta: '2026-11-14', cuotaCentavos: 0 })).toThrow('antes que');
    expect(() => esquemaTorneo.parse({ nombre: 'X1', deporte: 'futbol', fechaDesde: '2026-01-01', fechaHasta: '2026-12-31', cuotaCentavos: 0 })).toThrow('60 días');
  });
});
