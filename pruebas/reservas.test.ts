import { describe, expect, it } from 'vitest';
import { esquemaCancelacion, esquemaReserva } from '../src/compartido/esquemas';
import { cambiarEstado, cancelarReserva, crearReserva, obtenerReserva, reservasDelRango } from '../src/main/servicios/reservas';
import { AHORA, HOY, MANANA, SABADO, baseNueva, cancha, cliente, reservar, usuario } from './ayudantes';

describe('crear reservas', () => {
  it('arma la reserva con el precio de la franja y la hora de fin de la cancha', () => {
    const db = baseNueva();
    const c = cancha(db, { tarifas: [{ dias: 'todos', desde: '19:00', hasta: '24:00', precioCentavos: 3_000_000 }] });
    const k = cliente(db);
    const noche = obtenerReserva(db, reservar(db, { canchaId: c, clienteId: k, desde: '20:00' }));
    expect(noche.hasta).toBe('21:00');
    expect(noche.precioCentavos).toBe(3_000_000);
    expect(noche.estado).toBe('reservada');
    expect(noche.estadoDePago).toBe('sin_pago');
    const tarde = obtenerReserva(db, reservar(db, { canchaId: c, clienteId: k, desde: '16:00' }));
    expect(tarde.precioCentavos).toBe(2_000_000);
  });

  it('un turno de las 23 termina a las 24:00', () => {
    const db = baseNueva();
    const r = obtenerReserva(db, reservar(db, { canchaId: cancha(db), clienteId: cliente(db), desde: '23:00' }));
    expect(r.hasta).toBe('24:00');
  });

  it('no deja reservar dos veces el mismo horario ni uno que pisa a otro', () => {
    const db = baseNueva();
    const c = cancha(db, { duracionMin: 90, apertura: '14:00', cierre: '23:00' });
    const k = cliente(db);
    reservar(db, { canchaId: c, clienteId: k, desde: '15:30' });
    expect(() => reservar(db, { canchaId: c, clienteId: k, desde: '15:30' })).toThrow('Ese horario ya está reservado.');
    // 15:30 no es un turno de la grilla de 14:00 + 90: se rechaza antes de llegar al trigger
    expect(() => reservar(db, { canchaId: c, clienteId: k, desde: '16:00' })).toThrow('no tiene turno a las 16:00');
  });

  it('una reserva cancelada libera el horario', () => {
    const db = baseNueva();
    const c = cancha(db);
    const k = cliente(db);
    const r = reservar(db, { canchaId: c, clienteId: k });
    cancelarReserva(db, esquemaCancelacion.parse({ id: r, devolverSena: false }), AHORA);
    expect(() => reservar(db, { canchaId: c, clienteId: k })).not.toThrow();
  });

  it('no reserva el pasado, pero sí el turno que está en juego ahora', () => {
    const db = baseNueva();
    const c = cancha(db);
    const k = cliente(db);
    const u = usuario(db);
    const alas18 = new Date(2026, 10, 11, 18, 30);
    const reserva = (fecha: string, desde: string) => crearReserva(db, esquemaReserva.parse({ canchaId: c, clienteId: k, fecha, desde }), alas18, u);
    expect(() => reserva('2026-11-10', '20:00')).toThrow('Ese horario ya pasó.'); // ayer
    expect(() => reserva(HOY, '17:00')).toThrow('Ese horario ya pasó.'); // hoy, terminó a las 18
    expect(() => reserva(HOY, '18:00')).not.toThrow(); // hoy, en juego (18 a 19)
    expect(() => reserva(HOY, '19:00')).not.toThrow(); // hoy, más tarde
  });

  it('con seña: registra el pago y la reserva queda como "seña"', () => {
    const db = baseNueva();
    const r = obtenerReserva(db, reservar(db, { canchaId: cancha(db), clienteId: cliente(db), senaCentavos: 600_000, metodoSena: 'transferencia' }));
    expect(r.pagadoCentavos).toBe(600_000);
    expect(r.estadoDePago).toBe('sena');
    expect(r.pagos[0]?.metodo).toBe('transferencia');
  });

  it('la seña necesita método y no puede superar el precio', () => {
    expect(() => esquemaReserva.parse({ canchaId: 1, clienteId: 1, fecha: MANANA, desde: '20:00', senaCentavos: 100 })).toThrow('Elegí cómo paga la seña.');
    expect(() => esquemaReserva.parse({ canchaId: 1, clienteId: 1, fecha: MANANA, desde: '20:00', precioCentavos: 100, senaCentavos: 200, metodoSena: 'efectivo' })).toThrow('no puede ser más que el precio');
    const db = baseNueva();
    expect(() => reservar(db, { canchaId: cancha(db), clienteId: cliente(db), senaCentavos: 9_000_000, metodoSena: 'efectivo' })).toThrow('no puede ser más que el precio');
  });

  it('sin seña, el método se ignora', () => {
    expect(esquemaReserva.parse({ canchaId: 1, clienteId: 1, fecha: MANANA, desde: '20:00', metodoSena: 'efectivo' }).metodoSena).toBeNull();
  });

  it('no deja reservar en una cancha dada de baja ni a un cliente dado de baja, y guarda quién la cargó', () => {
    const db = baseNueva();
    const c = cancha(db);
    const k = cliente(db);
    const ana = usuario(db, 'Ana');
    const r = crearReserva(db, esquemaReserva.parse({ canchaId: c, clienteId: k, fecha: MANANA, desde: '20:00' }), AHORA, ana);
    expect(obtenerReserva(db, r).dadoPor).toBe('Ana');
    db.$client.prepare('UPDATE clientes SET activo = 0').run();
    expect(() => reservar(db, { canchaId: c, clienteId: k, desde: '21:00' })).toThrow('dado de baja');
    db.$client.prepare('UPDATE clientes SET activo = 1').run();
    db.$client.prepare('UPDATE canchas SET activo = 0').run();
    expect(() => reservar(db, { canchaId: c, clienteId: k, desde: '21:00' })).toThrow('dada de baja');
  });
});

describe('ver las reservas', () => {
  it('trae solo las del rango y deja afuera las canceladas', () => {
    const db = baseNueva();
    const c = cancha(db);
    const k = cliente(db);
    reservar(db, { canchaId: c, clienteId: k, fecha: HOY, desde: '20:00' });
    const b = reservar(db, { canchaId: c, clienteId: k, fecha: MANANA, desde: '20:00' });
    reservar(db, { canchaId: c, clienteId: k, fecha: SABADO, desde: '20:00' });
    cancelarReserva(db, esquemaCancelacion.parse({ id: b, devolverSena: false }), AHORA);
    const lista = reservasDelRango(db, { desde: HOY, hasta: MANANA });
    expect(lista.map((r) => r.fecha)).toEqual([HOY]);
    expect(lista[0]?.cliente).toBe('Los Pibes');
  });
});

describe('estados y cancelación', () => {
  it('marcar jugada solo desde el día del partido', () => {
    const db = baseNueva();
    const futura = reservar(db, { canchaId: cancha(db), clienteId: cliente(db), fecha: MANANA });
    expect(() => cambiarEstado(db, futura, 'jugada', AHORA)).toThrow('Todavía no llegó el día');
    const hoy = reservar(db, { canchaId: cancha(db, { nombre: 'Cancha 2' }), clienteId: cliente(db), fecha: HOY, desde: '20:00' });
    cambiarEstado(db, hoy, 'jugada', AHORA);
    expect(obtenerReserva(db, hoy).estado).toBe('jugada');
    cambiarEstado(db, hoy, 'reservada', AHORA); // corregir un error
    expect(obtenerReserva(db, hoy).estado).toBe('reservada');
  });

  it('"cancelada" no se pone con cambiarEstado: hay que decidir qué pasa con la seña', () => {
    const db = baseNueva();
    const r = reservar(db, { canchaId: cancha(db), clienteId: cliente(db), fecha: HOY });
    expect(() => cambiarEstado(db, r, 'cancelada', AHORA)).toThrow('Cancelar reserva');
  });

  it('cancelar y devolver la seña anula el pago; cancelar y quedársela lo deja', () => {
    const db = baseNueva();
    const c = cancha(db);
    const k = cliente(db);
    const con = (desde: string) => reservar(db, { canchaId: c, clienteId: k, desde, senaCentavos: 500_000, metodoSena: 'efectivo' });
    const a = con('20:00');
    const b = con('21:00');
    cancelarReserva(db, esquemaCancelacion.parse({ id: a, devolverSena: true }), AHORA);
    cancelarReserva(db, esquemaCancelacion.parse({ id: b, devolverSena: false }), AHORA);
    expect(obtenerReserva(db, a).pagadoCentavos).toBe(0);
    expect(obtenerReserva(db, a).estado).toBe('cancelada');
    expect(obtenerReserva(db, b).pagadoCentavos).toBe(500_000);
  });

  it('solo se cancelan las pendientes', () => {
    const db = baseNueva();
    const r = reservar(db, { canchaId: cancha(db), clienteId: cliente(db), fecha: HOY, desde: '20:00' });
    cambiarEstado(db, r, 'jugada', AHORA);
    expect(() => cancelarReserva(db, esquemaCancelacion.parse({ id: r, devolverSena: false }), AHORA)).toThrow('Solo se pueden cancelar las reservas pendientes.');
  });

  it('reactivar una cancelada falla si otro tomó el horario', () => {
    const db = baseNueva();
    const c = cancha(db);
    const k = cliente(db);
    const r = reservar(db, { canchaId: c, clienteId: k, fecha: HOY, desde: '20:00' });
    cancelarReserva(db, esquemaCancelacion.parse({ id: r, devolverSena: false }), AHORA);
    reservar(db, { canchaId: c, clienteId: k, fecha: HOY, desde: '20:00' });
    expect(() => cambiarEstado(db, r, 'reservada', AHORA)).toThrow('lo tomó otra reserva');
  });
});
