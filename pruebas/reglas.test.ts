import { describe, expect, it } from 'vitest';
import {
  estadoDePago,
  estadosPosibles,
  esHoraFin,
  esHorarioDeCancha,
  horariosDeCancha,
  precioDelTurno,
  senaSugerida,
  seSuperponen,
  sumarMinutos,
} from '../src/compartido/canchas';

describe('horarios de una cancha', () => {
  it('fútbol de 60 minutos: de 15 a 24 son 9 turnos', () => {
    const h = horariosDeCancha('15:00', '24:00', 60);
    expect(h).toHaveLength(9);
    expect(h[0]).toBe('15:00');
    expect(h[8]).toBe('23:00');
  });
  it('pádel de 90 minutos: de 14 a 23 son 6 turnos que arrancan a y media', () => {
    expect(horariosDeCancha('14:00', '23:00', 90)).toEqual(['14:00', '15:30', '17:00', '18:30', '20:00', '21:30']);
  });
  it('el último turno tiene que entrar entero antes del cierre', () => {
    expect(horariosDeCancha('14:00', '22:00', 90)).toEqual(['14:00', '15:30', '17:00', '18:30', '20:00']);
  });
  it('un horario que no es de la grilla no sirve', () => {
    const c = { apertura: '15:00', cierre: '24:00', duracionMin: 60 };
    expect(esHorarioDeCancha(c, '20:00')).toBe(true);
    expect(esHorarioDeCancha(c, '20:30')).toBe(false);
    expect(esHorarioDeCancha(c, '14:00')).toBe(false);
  });
  it('acepta 24:00 solo como hora de cierre', () => {
    expect(esHoraFin('24:00')).toBe(true);
    expect(esHoraFin('23:59')).toBe(true);
    expect(esHoraFin('24:30')).toBe(false);
    expect(sumarMinutos('23:00', 60)).toBe('24:00');
  });
  it('turnos pegados no se superponen', () => {
    expect(seSuperponen({ desde: '20:00', hasta: '21:00' }, { desde: '21:00', hasta: '22:00' })).toBe(false);
    expect(seSuperponen({ desde: '20:00', hasta: '21:00' }, { desde: '20:30', hasta: '21:30' })).toBe(true);
  });
});

describe('precio por franja', () => {
  const cancha = {
    precioBaseCentavos: 2_000_000,
    tarifas: [
      { dias: 'todos' as const, desde: '19:00', hasta: '24:00', precioCentavos: 3_000_000 },
      { dias: 'finde' as const, desde: '15:00', hasta: '24:00', precioCentavos: 4_000_000 },
    ],
  };
  it('de día, sin franja, vale el precio base', () => {
    expect(precioDelTurno(cancha, '2026-11-11', '16:00')).toBe(2_000_000); // miércoles
  });
  it('de noche vale la franja nocturna', () => {
    expect(precioDelTurno(cancha, '2026-11-11', '21:00')).toBe(3_000_000);
  });
  it('la franja justo en el borde: a las 19:00 ya es de noche, a las 18:00 no', () => {
    expect(precioDelTurno(cancha, '2026-11-11', '19:00')).toBe(3_000_000);
    expect(precioDelTurno(cancha, '2026-11-11', '18:00')).toBe(2_000_000);
  });
  it('el fin de semana gana la franja de fin de semana sobre la de todos los días', () => {
    expect(precioDelTurno(cancha, '2026-11-14', '21:00')).toBe(4_000_000); // sábado
    expect(precioDelTurno(cancha, '2026-11-15', '16:00')).toBe(4_000_000); // domingo
  });
});

describe('pagos y seña', () => {
  it('estado de pago', () => {
    expect(estadoDePago(3_000_000, 0)).toBe('sin_pago');
    expect(estadoDePago(3_000_000, 900_000)).toBe('sena');
    expect(estadoDePago(3_000_000, 3_000_000)).toBe('saldado');
    expect(estadoDePago(0, 0)).toBe('saldado');
  });
  it('la seña sugerida se redondea a $ 100 y nunca pasa del precio', () => {
    expect(senaSugerida(3_000_000, 30)).toBe(900_000);
    expect(senaSugerida(2_233_300, 30)).toBe(670_000); // 6.699 → $ 6.700
    expect(senaSugerida(3_000_000, 0)).toBe(0);
    expect(senaSugerida(50_000, 100)).toBe(50_000);
  });
});

describe('estados de una reserva', () => {
  it('jugada o "no vino" solo desde el día del partido', () => {
    expect(estadosPosibles('reservada', '2026-11-12', '2026-11-11')).toEqual([]);
    expect(estadosPosibles('reservada', '2026-11-11', '2026-11-11')).toEqual(['jugada', 'ausente']);
  });
  it('se puede volver atrás para corregir un error', () => {
    expect(estadosPosibles('jugada', '2026-11-10', '2026-11-11')).toEqual(['reservada']);
    expect(estadosPosibles('ausente', '2026-11-10', '2026-11-11')).toEqual(['reservada']);
  });
  it('una cancelada solo se reactiva si el día no pasó', () => {
    expect(estadosPosibles('cancelada', '2026-11-10', '2026-11-11')).toEqual([]);
    expect(estadosPosibles('cancelada', '2026-11-11', '2026-11-11')).toEqual(['reservada']);
  });
});
