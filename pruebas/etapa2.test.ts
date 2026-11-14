import { describe, expect, it } from 'vitest';
import { bloqueoCubre } from '../src/compartido/canchas';
import { esquemaAbono, esquemaBloqueo, esquemaMover, esquemaPago, esquemaReserva } from '../src/compartido/esquemas';
import { fechasDeUnDia, sumarDias } from '../src/compartido/horarios';
import { crearAbono, extenderAbonos, HORIZONTE_DIAS, listarAbonos, terminarAbono } from '../src/main/servicios/abonos';
import { contarAfectadas, crearBloqueo, listarBloqueos, quitarBloqueo } from '../src/main/servicios/bloqueos';
import { registrarPago } from '../src/main/servicios/pagos';
import { cambiarEstado, crearReserva, moverReserva, obtenerReserva, reservasDelRango } from '../src/main/servicios/reservas';
import { AHORA, HOY, MANANA, baseNueva, cancha, cliente, reservar, usuario } from './ayudantes';

const bloqueo = (datos: Record<string, unknown>) => esquemaBloqueo.parse({ canchaId: null, fechaDesde: MANANA, fechaHasta: MANANA, motivo: 'lluvia', ...datos });
const abono = (datos: Record<string, unknown>) => esquemaAbono.parse({ diaSemana: 2, desde: '21:00', desdeFecha: HOY, precioCentavos: 1_800_000, ...datos });
const todas = (db: ReturnType<typeof baseNueva>) => reservasDelRango(db, { desde: HOY, hasta: sumarDias(HOY, 41) });

describe('fechas', () => {
  it('suma días y encuentra los martes de un rango', () => {
    expect(sumarDias('2026-11-30', 1)).toBe('2026-12-01');
    expect(sumarDias('2026-03-01', -1)).toBe('2026-02-28');
    expect(fechasDeUnDia(2, '2026-11-11', '2026-12-01')).toEqual(['2026-11-17', '2026-11-24', '2026-12-01']);
  });
  it('un bloqueo parcial solo tapa su horario', () => {
    const b = { canchaId: 1, fechaDesde: MANANA, fechaHasta: MANANA, desde: '15:00', hasta: '19:00' };
    expect(bloqueoCubre(b, 1, MANANA, '18:00', '19:00')).toBe(true);
    expect(bloqueoCubre(b, 1, MANANA, '19:00', '20:00')).toBe(false);
    expect(bloqueoCubre(b, 2, MANANA, '18:00', '19:00')).toBe(false);
    expect(bloqueoCubre({ ...b, canchaId: null, desde: null, hasta: null }, 2, MANANA, '23:00', '24:00')).toBe(true);
  });
});

describe('abonos', () => {
  it('crea los turnos de las próximas semanas con el precio del abono', () => {
    const db = baseNueva();
    const c = cancha(db);
    const r = crearAbono(db, abono({ canchaId: c, clienteId: cliente(db) }), AHORA, usuario(db));
    expect(r.creadas).toBeGreaterThan(7);
    expect(r.omitidas).toEqual([]);
    const turnos = reservasDelRango(db, { desde: HOY, hasta: sumarDias(HOY, 41) });
    expect(turnos[0]).toMatchObject({ fecha: '2026-11-17', desde: '21:00', hasta: '22:00', precioCentavos: 1_800_000 });
    expect(turnos.every((t) => t.abonoId !== null)).toBe(true);
    expect(listarAbonos(db, AHORA)[0]).toMatchObject({ proxima: '2026-11-17', activo: true });
  });
  it('extender no duplica, y una semana cancelada no vuelve a aparecer sola', () => {
    const db = baseNueva();
    const r = crearAbono(db, abono({ canchaId: cancha(db), clienteId: cliente(db) }), AHORA, usuario(db));
    expect(extenderAbonos(db, AHORA)).toBe(0);
    const primero = todas(db)[0]!;
    db.$client.prepare(`UPDATE reservas SET estado = 'cancelada' WHERE id = ?`).run(primero.id);
    expect(extenderAbonos(db, AHORA)).toBe(0);
    // pasan 3 semanas: aparecen las nuevas del final, pero la cancelada sigue cancelada
    const luego = new Date(2026, 10, 25, 12, 0);
    expect(extenderAbonos(db, luego)).toBeGreaterThan(0);
    expect(obtenerReserva(db, primero.id).estado).toBe('cancelada');
    expect(r.creadas).toBeGreaterThan(0);
  });
  it('si un martes ya estaba ocupado, lo avisa y carga los demás', () => {
    const db = baseNueva();
    const c = cancha(db);
    const cl = cliente(db);
    reservar(db, { canchaId: c, clienteId: cl, fecha: '2026-11-24', desde: '21:00' });
    const r = crearAbono(db, abono({ canchaId: c, clienteId: cl }), AHORA, usuario(db));
    expect(r.omitidas).toEqual([{ fecha: '2026-11-24', motivo: 'ya estaba reservado' }]);
    expect(r.creadas).toBeGreaterThan(6);
  });
  it('rechaza horarios que la cancha no tiene o fechas pasadas', () => {
    const db = baseNueva();
    const c = cancha(db);
    const u = usuario(db);
    expect(() => crearAbono(db, abono({ canchaId: c, clienteId: cliente(db), desde: '10:00' }), AHORA, u)).toThrow('no tiene turno');
    expect(() => crearAbono(db, abono({ canchaId: c, clienteId: 1, desdeFecha: '2026-10-01', hastaFecha: '2026-11-01' }), AHORA, u)).toThrow('ya pasó');
    expect(esquemaAbono.safeParse({ canchaId: 1, clienteId: 1, diaSemana: 8, desde: '21:00', desdeFecha: HOY, precioCentavos: 0 }).success).toBe(false);
  });
  it('terminar cancela los turnos futuros y no genera más', () => {
    const db = baseNueva();
    const u = usuario(db);
    const r = crearAbono(db, abono({ canchaId: cancha(db), clienteId: cliente(db) }), AHORA, u);
    const cancelados = terminarAbono(db, { id: r.id, devolverSena: true }, AHORA);
    expect(cancelados).toBe(r.creadas);
    expect(todas(db)).toHaveLength(0);
    expect(extenderAbonos(db, new Date(2026, 11, 20, 12, 0))).toBe(0);
    expect(listarAbonos(db, AHORA)[0]).toMatchObject({ activo: false, pendientes: 0 });
    expect(() => terminarAbono(db, { id: r.id, devolverSena: true }, AHORA)).toThrow('ya estaba terminado');
  });
  it('el horizonte es de 8 semanas', () => {
    expect(HORIZONTE_DIAS).toBe(56);
  });
});

describe('bloqueos', () => {
  it('no se puede reservar en una cancha bloqueada, pero sí en otro horario o en otra cancha', () => {
    const db = baseNueva();
    const c1 = cancha(db);
    const c2 = cancha(db, { nombre: 'Cancha 2' });
    const cl = cliente(db);
    crearBloqueo(db, bloqueo({ canchaId: c1, desde: '15:00', hasta: '19:00', motivo: 'mantenimiento', nota: 'pintura' }), AHORA);
    expect(() => reservar(db, { canchaId: c1, clienteId: cl, desde: '18:00' })).toThrow('cerrada en ese horario: Mantenimiento (pintura)');
    expect(reservar(db, { canchaId: c1, clienteId: cl, desde: '19:00' })).toBeGreaterThan(0);
    expect(reservar(db, { canchaId: c2, clienteId: cl, desde: '18:00' })).toBeGreaterThan(0);
  });
  it('un bloqueo de todas las canchas y todo el día cierra todo', () => {
    const db = baseNueva();
    const c1 = cancha(db);
    crearBloqueo(db, bloqueo({}), AHORA);
    expect(() => reservar(db, { canchaId: c1, clienteId: cliente(db), desde: '23:00' })).toThrow('Lluvia');
    expect(listarBloqueos(db, AHORA)).toHaveLength(1);
  });
  it('con reservas en el horario avisa, y si se pide las cancela devolviendo la seña', () => {
    const db = baseNueva();
    const u = usuario(db);
    const c = cancha(db);
    const r = reservar(db, { canchaId: c, clienteId: cliente(db), desde: '20:00' }, u);
    registrarPago(db, esquemaPago.parse({ reservaId: r, montoCentavos: 600_000, metodo: 'efectivo' }), u, AHORA);
    expect(contarAfectadas(db, bloqueo({ canchaId: c }), AHORA)).toBe(1);
    expect(() => crearBloqueo(db, bloqueo({ canchaId: c }), AHORA)).toThrow('Hay 1 reserva');
    expect(crearBloqueo(db, bloqueo({ canchaId: c, cancelarReservas: true }), AHORA).canceladas).toBe(1);
    expect(obtenerReserva(db, r)).toMatchObject({ estado: 'cancelada', pagadoCentavos: 0 });
  });
  it('si no se devuelve la seña, queda cobrada', () => {
    const db = baseNueva();
    const u = usuario(db);
    const c = cancha(db);
    const r = reservar(db, { canchaId: c, clienteId: cliente(db), desde: '20:00' }, u);
    registrarPago(db, esquemaPago.parse({ reservaId: r, montoCentavos: 600_000, metodo: 'efectivo' }), u, AHORA);
    crearBloqueo(db, bloqueo({ canchaId: c, cancelarReservas: true, devolverSena: false }), AHORA);
    expect(obtenerReserva(db, r).pagadoCentavos).toBe(600_000);
  });
  it('un bloqueo en un día con abono cancela ese turno y el abono no lo recrea', () => {
    const db = baseNueva();
    const c = cancha(db);
    crearAbono(db, abono({ canchaId: c, clienteId: cliente(db) }), AHORA, usuario(db));
    crearBloqueo(db, bloqueo({ fechaDesde: '2026-11-17', fechaHasta: '2026-11-17', cancelarReservas: true }), AHORA);
    expect(todas(db).some((t) => t.fecha === '2026-11-17')).toBe(false);
    expect(extenderAbonos(db, new Date(2026, 10, 12, 12, 0))).toBe(0);
    expect(todas(db).some((t) => t.fecha === '2026-11-17')).toBe(false);
  });
  it('al levantar el bloqueo se puede volver a reservar', () => {
    const db = baseNueva();
    const c = cancha(db);
    const { id } = crearBloqueo(db, bloqueo({ canchaId: c }), AHORA);
    quitarBloqueo(db, id);
    expect(reservar(db, { canchaId: c, clienteId: cliente(db), desde: '20:00' })).toBeGreaterThan(0);
    expect(() => quitarBloqueo(db, id)).toThrow('ya no existe');
  });
  it('no se bloquea el pasado y las reglas de Zod se cumplen', () => {
    const db = baseNueva();
    expect(() => crearBloqueo(db, bloqueo({ fechaDesde: '2026-11-01', fechaHasta: '2026-11-02' }), AHORA)).toThrow('ya pasó');
    expect(esquemaBloqueo.safeParse({ canchaId: null, fechaDesde: MANANA, fechaHasta: HOY, motivo: 'lluvia' }).success).toBe(false);
    expect(esquemaBloqueo.safeParse({ canchaId: null, fechaDesde: MANANA, fechaHasta: MANANA, desde: '15:00', motivo: 'lluvia' }).success).toBe(false);
    expect(esquemaBloqueo.safeParse({ canchaId: null, fechaDesde: MANANA, fechaHasta: MANANA, desde: '19:00', hasta: '15:00', motivo: 'lluvia' }).success).toBe(false);
  });
});

describe('mover una reserva', () => {
  const mover = (db: ReturnType<typeof baseNueva>, id: number, datos: Record<string, unknown>) => moverReserva(db, esquemaMover.parse({ id, ...datos }), AHORA);

  it('cambia de cancha y de día conservando el precio y los pagos', () => {
    const db = baseNueva();
    const u = usuario(db);
    const c1 = cancha(db);
    const c2 = cancha(db, { nombre: 'Cancha 2' });
    const r = reservar(db, { canchaId: c1, clienteId: cliente(db), desde: '20:00', precioCentavos: 2_500_000 }, u);
    registrarPago(db, esquemaPago.parse({ reservaId: r, montoCentavos: 700_000, metodo: 'efectivo' }), u, AHORA);
    mover(db, r, { canchaId: c2, fecha: '2026-11-13', desde: '22:00' });
    expect(obtenerReserva(db, r)).toMatchObject({ canchaId: c2, fecha: '2026-11-13', desde: '22:00', hasta: '23:00', precioCentavos: 2_500_000, pagadoCentavos: 700_000 });
  });
  it('no se puede mover a un horario ocupado, bloqueado, pasado o de otra duración', () => {
    const db = baseNueva();
    const c1 = cancha(db);
    const c2 = cancha(db, { nombre: 'Cancha 2' });
    const padel = cancha(db, { nombre: 'Pádel 1', deporte: 'padel', duracionMin: 90, apertura: '14:00', cierre: '23:00' });
    const cl = cliente(db);
    const r = reservar(db, { canchaId: c1, clienteId: cl, desde: '20:00' });
    reservar(db, { canchaId: c2, clienteId: cl, desde: '21:00' });
    expect(() => mover(db, r, { canchaId: c2, fecha: MANANA, desde: '21:00' })).toThrow('ya está reservado');
    expect(() => mover(db, r, { canchaId: c1, fecha: '2026-11-10', desde: '20:00' })).toThrow('ya pasó');
    expect(() => mover(db, r, { canchaId: padel, fecha: MANANA, desde: '14:00' })).toThrow('90 minutos');
    expect(() => mover(db, r, { canchaId: c1, fecha: MANANA, desde: '20:00' })).toThrow('ya está en ese horario');
    expect(() => mover(db, r, { canchaId: c1, fecha: MANANA, desde: '20:30' })).toThrow('no tiene turno');
    crearBloqueo(db, bloqueo({ canchaId: c2, fechaDesde: '2026-11-13', fechaHasta: '2026-11-13' }), AHORA);
    expect(() => mover(db, r, { canchaId: c2, fecha: '2026-11-13', desde: '20:00' })).toThrow('cerrada');
    expect(obtenerReserva(db, r)).toMatchObject({ canchaId: c1, desde: '20:00' }); // nada cambió
  });
  it('solo se mueven las pendientes', () => {
    const db = baseNueva();
    const c = cancha(db);
    const r = reservar(db, { canchaId: c, clienteId: cliente(db), fecha: HOY, desde: '15:00' }, null, new Date(2026, 10, 11, 8, 0));
    cambiarEstado(db, r, 'jugada', new Date(2026, 10, 11, 17, 0));
    expect(() => mover(db, r, { canchaId: c, fecha: MANANA, desde: '20:00' })).toThrow('pendientes');
  });
  it('mover un turno de abono deja el hueco anotado: el abono no lo vuelve a cargar', () => {
    const db = baseNueva();
    const c = cancha(db);
    crearAbono(db, abono({ canchaId: c, clienteId: cliente(db) }), AHORA, usuario(db));
    const turno = todas(db)[0]!; // martes 17
    mover(db, turno.id, { canchaId: c, fecha: '2026-11-18', desde: '21:00' });
    expect(obtenerReserva(db, turno.id)).toMatchObject({ fecha: '2026-11-18', abonoId: null });
    expect(extenderAbonos(db, new Date(2026, 10, 12, 12, 0))).toBe(0);
    expect(todas(db).some((t) => t.fecha === '2026-11-17')).toBe(false);
    // y se puede reservar ese hueco para otro
    expect(crearReserva(db, esquemaReserva.parse({ canchaId: c, clienteId: 1, fecha: '2026-11-17', desde: '21:00' }), AHORA, 1)).toBeGreaterThan(0);
  });
});
