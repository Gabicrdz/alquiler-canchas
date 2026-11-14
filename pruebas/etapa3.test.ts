import { describe, expect, it } from 'vitest';
import { armarMensaje, enlaceDeWhatsApp, telefonoParaWhatsApp } from '../src/compartido/mensajes';
import { esquemaAviso, esquemaBloqueo, esquemaCancelacion, esquemaPago, esquemaRangoReporte } from '../src/compartido/esquemas';
import { crearBloqueo } from '../src/main/servicios/bloqueos';
import { registrarPago } from '../src/main/servicios/pagos';
import { cambiarEstado, cancelarReserva } from '../src/main/servicios/reservas';
import { obtenerReporte } from '../src/main/servicios/reportes';
import { cargarEjemplo } from '../src/main/servicios/ejemplo';
import { listarTorneos, obtenerTorneo } from '../src/main/servicios/torneos';
import { prepararAviso } from '../src/main/servicios/whatsapp';
import { AHORA, HOY, baseNueva, cancha, cliente, reservar, usuario } from './ayudantes';

const rango = (desde = HOY, hasta = HOY) => esquemaRangoReporte.parse({ desde, hasta });
const pagar = (db: ReturnType<typeof baseNueva>, reservaId: number, monto: number, metodo = 'efectivo', uid = 1) =>
  registrarPago(db, esquemaPago.parse({ reservaId, montoCentavos: monto, metodo }), uid, AHORA);

describe('teléfonos para WhatsApp', () => {
  it('entiende cómo escribe la gente', () => {
    expect(telefonoParaWhatsApp('370 455-1020')).toBe('5493704551020');
    expect(telefonoParaWhatsApp('0370 455-1020')).toBe('5493704551020');
    expect(telefonoParaWhatsApp('+54 9 370 455 1020')).toBe('5493704551020');
    expect(telefonoParaWhatsApp('0370 15 455-1020')).toBe('5493704551020');
    expect(telefonoParaWhatsApp('370 15 4551020')).toBe('5493704551020');
    expect(telefonoParaWhatsApp('5493704551020')).toBe('5493704551020');
  });
  it('rechaza lo que no alcanza', () => {
    expect(telefonoParaWhatsApp('')).toBeNull();
    expect(telefonoParaWhatsApp('455-1020')).toBeNull();
    expect(telefonoParaWhatsApp('sin teléfono')).toBeNull();
  });
});

describe('mensajes', () => {
  const datos = { complejo: 'Canchas El Gol', cliente: 'Los Pibes FC', cancha: 'Cancha 1', fecha: '2026-11-14', desde: '21:00', saldoCentavos: 1_200_000 };
  it('el recordatorio dice cancha, día y hora', () => {
    const t = armarMensaje('recordatorio', datos);
    expect(t).toContain('Hola Los Pibes!');
    expect(t).toContain('Cancha 1, sábado 14/11 a las 21:00 h');
    expect(t).toContain('Canchas El Gol');
  });
  it('el cobro dice cuánto falta', () => {
    expect(armarMensaje('cobro', datos)).toContain('saldo de $ 12.000');
    expect(armarMensaje('cobro', { ...datos, saldoCentavos: 0 })).not.toContain('saldo de');
  });
  it('el enlace va codificado', () => {
    const url = enlaceDeWhatsApp('5493704551020', 'Hola! ¿Venís?');
    expect(url.startsWith('https://wa.me/5493704551020?text=')).toBe(true);
    expect(url).not.toContain(' ');
    expect(decodeURIComponent(url.split('text=')[1]!)).toBe('Hola! ¿Venís?');
  });
});

describe('aviso por WhatsApp de una reserva', () => {
  it('arma el enlace con el teléfono del cliente', () => {
    const db = baseNueva();
    const r = reservar(db, { canchaId: cancha(db), clienteId: cliente(db), fecha: '2026-11-14', desde: '21:00' });
    const a = prepararAviso(db, esquemaAviso.parse({ reservaId: r, tipo: 'recordatorio' }));
    expect(a.telefono).toBe('5493704551020');
    expect(a.url).toContain('https://wa.me/5493704551020?text=');
    expect(decodeURIComponent(a.url)).toContain('Cancha 1, sábado 14/11 a las 21:00 h');
  });
  it('avisa si no hay teléfono o no sirve', () => {
    const db = baseNueva();
    const c = cancha(db);
    const sin = reservar(db, { canchaId: c, clienteId: cliente(db, { nombre: 'Sin Tel', telefono: '' }) });
    const malo = reservar(db, { canchaId: c, clienteId: cliente(db, { nombre: 'Malo', telefono: '123' }), desde: '21:00' });
    expect(() => prepararAviso(db, esquemaAviso.parse({ reservaId: sin, tipo: 'recordatorio' }))).toThrow('no tiene teléfono');
    expect(() => prepararAviso(db, esquemaAviso.parse({ reservaId: malo, tipo: 'recordatorio' }))).toThrow('no parece un celular');
  });
  it('el cobro pide que haya saldo y el recordatorio, que el turno esté pendiente', () => {
    const db = baseNueva();
    const u = usuario(db);
    const r = reservar(db, { canchaId: cancha(db), clienteId: cliente(db), fecha: HOY, desde: '15:00' }, u);
    expect(prepararAviso(db, esquemaAviso.parse({ reservaId: r, tipo: 'cobro' })).url).toContain('wa.me');
    pagar(db, r, 2_000_000, 'efectivo', u);
    expect(() => prepararAviso(db, esquemaAviso.parse({ reservaId: r, tipo: 'cobro' }))).toThrow('no tiene saldo');
    cambiarEstado(db, r, 'jugada', AHORA);
    expect(() => prepararAviso(db, esquemaAviso.parse({ reservaId: r, tipo: 'recordatorio' }))).toThrow('pendientes');
  });
});

describe('reporte', () => {
  it('el rango es de un año como máximo', () => {
    expect(() => esquemaRangoReporte.parse({ desde: '2026-01-01', hasta: '2027-06-01' })).toThrow('un año');
    expect(esquemaRangoReporte.parse({ desde: '2026-01-01', hasta: '2026-12-31' })).toBeDefined();
  });

  it('sin reservas: todo en cero y turnos disponibles de las canchas activas', () => {
    const db = baseNueva();
    cancha(db);
    const r = obtenerReporte(db, rango());
    expect(r.resumen).toMatchObject({ reservas: 0, turnosDisponibles: 9, turnosOcupados: 0, ocupacion: 0, cobradoCentavos: 0 });
    expect(r.porDia).toHaveLength(1);
  });

  it('cuenta ocupación por estado, sin las canceladas', () => {
    const db = baseNueva();
    const u = usuario(db);
    const c = cancha(db);
    const a = cliente(db, { nombre: 'Ana' });
    const jugada = reservar(db, { canchaId: c, clienteId: a, fecha: HOY, desde: '15:00' }, u);
    const ausente = reservar(db, { canchaId: c, clienteId: a, fecha: HOY, desde: '16:00' }, u);
    const cancelada = reservar(db, { canchaId: c, clienteId: a, fecha: HOY, desde: '17:00' }, u);
    reservar(db, { canchaId: c, clienteId: a, fecha: HOY, desde: '22:00' }, u);
    cambiarEstado(db, jugada, 'jugada', AHORA);
    cambiarEstado(db, ausente, 'ausente', AHORA);
    cancelarReserva(db, esquemaCancelacion.parse({ id: cancelada, devolverSena: true }), AHORA);
    const { resumen } = obtenerReporte(db, rango());
    expect(resumen).toMatchObject({ reservas: 3, jugadas: 1, ausentes: 1, pendientes: 1, canceladas: 1, turnosOcupados: 3, turnosDisponibles: 9 });
    expect(Math.round(resumen.ocupacion * 1000)).toBe(333);
  });

  it('los turnos bloqueados no cuentan como disponibles', () => {
    const db = baseNueva();
    cancha(db);
    crearBloqueo(db, esquemaBloqueo.parse({ canchaId: null, fechaDesde: HOY, fechaHasta: HOY, desde: '15:00', hasta: '18:00', motivo: 'lluvia' }), AHORA);
    expect(obtenerReporte(db, rango()).resumen.turnosDisponibles).toBe(6);
  });

  it('la plata se cuenta por día de cobro y por método, sin los pagos anulados', () => {
    const db = baseNueva();
    const u = usuario(db);
    const c = cancha(db);
    const r1 = reservar(db, { canchaId: c, clienteId: cliente(db), fecha: '2026-11-20', desde: '20:00' }, u);
    pagar(db, r1, 600_000, 'efectivo', u);
    pagar(db, r1, 400_000, 'transferencia', u);
    const mala = pagar(db, r1, 100_000, 'tarjeta', u);
    db.$client.prepare('UPDATE pagos SET anulado = 1 WHERE id = ?').run(mala);
    // El turno es el 20, pero los cobros fueron HOY (11/11): cuentan en HOY.
    const hoy = obtenerReporte(db, rango());
    expect(hoy.resumen.cobradoCentavos).toBe(1_000_000);
    expect(hoy.porMetodo.find((m) => m.metodo === 'efectivo')).toMatchObject({ centavos: 600_000, cobros: 1 });
    expect(hoy.porMetodo.find((m) => m.metodo === 'tarjeta')).toMatchObject({ centavos: 0, cobros: 0 });
    expect(hoy.resumen.reservas).toBe(0); // el turno no cae en el rango
    expect(obtenerReporte(db, rango('2026-11-20', '2026-11-20')).resumen.cobradoCentavos).toBe(0);
    expect(hoy.porCancha[0]!.cobradoCentavos).toBe(1_000_000);
  });

  it('arma la ocupación por cancha, la franja y el ranking de clientes', () => {
    const db = baseNueva();
    const u = usuario(db);
    const c1 = cancha(db, { nombre: 'Cancha 1' });
    const c2 = cancha(db, { nombre: 'Padel 1', deporte: 'padel', duracionMin: 90 });
    const pibes = cliente(db, { nombre: 'Los Pibes' });
    const ana = cliente(db, { nombre: 'Ana', telefono: '370 411-2233' });
    reservar(db, { canchaId: c1, clienteId: pibes, fecha: HOY, desde: '20:00' }, u);
    reservar(db, { canchaId: c1, clienteId: pibes, fecha: HOY, desde: '21:00' }, u);
    reservar(db, { canchaId: c2, clienteId: ana, fecha: HOY, desde: '21:00' }, u);
    const r = obtenerReporte(db, rango());
    expect(r.porCancha.map((c) => `${c.nombre}:${c.reservas}`).sort()).toEqual(['Cancha 1:2', 'Padel 1:1']);
    expect(r.topClientes.map((c) => [c.nombre, c.reservas])).toEqual([['Los Pibes', 2], ['Ana', 1]]);
    // 11/11/2026 es miércoles (3); a las 21 h arrancan un turno de fútbol y uno de pádel
    expect(r.mapa.find((m) => m.dia === 3 && m.hora === '20:00')).toMatchObject({ ocupados: 1 });
    expect(r.mapa.find((m) => m.dia === 3 && m.hora === '21:00')).toMatchObject({ ocupados: 2 });
  });

  it('lista a los que deben (turnos jugados con saldo)', () => {
    const db = baseNueva();
    const u = usuario(db);
    const c = cancha(db);
    const cl = cliente(db, { nombre: 'Moroso' });
    const r = reservar(db, { canchaId: c, clienteId: cl, fecha: HOY, desde: '15:00' }, u);
    const pendiente = reservar(db, { canchaId: c, clienteId: cl, fecha: HOY, desde: '16:00' }, u);
    pagar(db, r, 500_000, 'efectivo', u);
    cambiarEstado(db, r, 'jugada', AHORA);
    const { deudores, resumen } = obtenerReporte(db, rango());
    expect(deudores).toHaveLength(1); // la pendiente todavía no es deuda
    expect(deudores[0]).toMatchObject({ reservaId: r, cliente: 'Moroso', saldoCentavos: 1_500_000, cancha: 'Cancha 1' });
    expect(resumen.porCobrarCentavos).toBe(1_500_000);
    expect(pendiente).toBeGreaterThan(0);
  });

  it('los datos de ejemplo traen plata cobrada en distintos días y algunos saldos para reclamar', () => {
    const db = baseNueva();
    usuario(db);
    cargarEjemplo(db, AHORA);
    const r = obtenerReporte(db, rango('2026-10-13', HOY));
    expect(r.resumen.cobradoCentavos).toBeGreaterThan(0);
    expect(r.porDia.filter((d) => d.cobradoCentavos > 0).length).toBeGreaterThan(10);
    expect(r.deudores.length).toBeGreaterThan(0);
    expect(r.resumen.porCobrarCentavos).toBeGreaterThan(0);
  });

  it('los datos de ejemplo traen un torneo en marcha', () => {
    const db = baseNueva();
    usuario(db);
    cargarEjemplo(db, AHORA);
    const t = listarTorneos(db)[0]!;
    expect(t).toMatchObject({ nombre: 'Copa Verano', estado: 'en_juego', equipos: 6, partidos: 15 });
    expect(t.partidosJugados).toBeGreaterThan(0);
    expect(obtenerTorneo(db, t.id).posiciones).toHaveLength(6);
  });
});
