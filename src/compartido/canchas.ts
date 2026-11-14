// Reglas de las canchas que comparten el main y la ventana. Son funciones
// puras (sin base de datos): reciben datos y devuelven un resultado, así se
// prueban fácil y la ventana muestra exactamente lo mismo que después controla el main.
import { aHora, aMinutos, diaDeLaSemana } from './horarios';

// ---------- Deportes ----------
export const DEPORTES = ['futbol', 'padel'] as const;
export type Deporte = (typeof DEPORTES)[number];

export const NOMBRE_DEPORTE: Record<Deporte, string> = { futbol: 'Fútbol', padel: 'Pádel' };

/** Lo que se propone al crear una cancha nueva de cada deporte. */
export const PROPUESTA: Record<Deporte, { duracionMin: number; apertura: string; cierre: string; detalle: string }> = {
  futbol: { duracionMin: 60, apertura: '15:00', cierre: '24:00', detalle: 'Fútbol 5 · césped sintético' },
  padel: { duracionMin: 90, apertura: '14:00', cierre: '23:00', detalle: 'Pádel · cristal' },
};

// ---------- Estados de una reserva ----------
export const ESTADOS = ['reservada', 'jugada', 'ausente', 'cancelada'] as const;
export type EstadoReserva = (typeof ESTADOS)[number];

export const NOMBRE_ESTADO: Record<EstadoReserva, string> = {
  reservada: 'Reservada',
  jugada: 'Jugada',
  ausente: 'No vino',
  cancelada: 'Cancelada',
};

/**
 * A qué estado puede pasar una reserva (una "máquina de estados"):
 * - Jugada o "no vino" solo se marcan el día del partido o después.
 * - Los "volver atrás" (jugada → reservada) están para corregir un error.
 * - Una cancelada se puede reactivar solo si el día todavía no pasó.
 * `cancelada` se pide aparte (hay que decidir qué pasa con la seña), por eso no figura acá.
 */
export function estadosPosibles(estado: EstadoReserva, fecha: string, hoy: string): EstadoReserva[] {
  const yaLlegoElDia = fecha <= hoy;
  switch (estado) {
    case 'reservada':
      return yaLlegoElDia ? ['jugada', 'ausente'] : [];
    case 'jugada':
    case 'ausente':
      return ['reservada'];
    case 'cancelada':
      return fecha >= hoy ? ['reservada'] : [];
  }
}

/** ¿Se puede cancelar? Solo las pendientes (una jugada o un "no vino" ya pasaron). */
export const sePuedeCancelar = (estado: EstadoReserva) => estado === 'reservada';

/** ¿Ocupa la cancha? Todas menos las canceladas. */
export const ocupaCancha = (estado: EstadoReserva) => estado !== 'cancelada';

// ---------- Horarios ----------
interface Intervalo {
  desde: string;
  hasta: string;
}

/** Hora de fin: como la hora normal, pero también vale '24:00' (la cancha cierra a medianoche). */
export function esHoraFin(texto: string): boolean {
  return texto === '24:00' || /^([01]\d|2[0-3]):[0-5]\d$/.test(texto);
}

/** Dos reservas se pisan si cada una empieza antes de que termine la otra. 15:00–16:00 y 16:00–17:00 NO. */
export function seSuperponen(a: Intervalo, b: Intervalo): boolean {
  return a.desde < b.hasta && b.desde < a.hasta;
}

export function sumarMinutos(hora: string, minutos: number): string {
  return aHora(aMinutos(hora) + minutos);
}

/**
 * Los horarios de inicio de una cancha en un día: desde la apertura, de a
 * `duracionMin`, mientras el partido entre entero antes del cierre.
 * Ej.: 14:00 a 23:00 con 90 min → 14:00, 15:30, 17:00, 18:30, 20:00, 21:30.
 */
export function horariosDeCancha(apertura: string, cierre: string, duracionMin: number): string[] {
  const inicios: string[] = [];
  for (let m = aMinutos(apertura); m + duracionMin <= aMinutos(cierre); m += duracionMin) inicios.push(aHora(m));
  return inicios;
}

/** ¿Ese horario es uno de los que la cancha ofrece? (así la grilla nunca queda "torcida") */
export function esHorarioDeCancha(c: { apertura: string; cierre: string; duracionMin: number }, desde: string): boolean {
  return horariosDeCancha(c.apertura, c.cierre, c.duracionMin).includes(desde);
}

// ---------- Precios ----------
export const TIPOS_DE_DIA = ['todos', 'semana', 'finde'] as const;
export type TipoDeDia = (typeof TIPOS_DE_DIA)[number];

export const NOMBRE_TIPO_DE_DIA: Record<TipoDeDia, string> = {
  todos: 'Todos los días',
  semana: 'Lunes a viernes',
  finde: 'Sábado y domingo',
};

export interface Tarifa {
  dias: TipoDeDia;
  desde: string;
  hasta: string;
  precioCentavos: number;
}

/**
 * El precio de un turno: se busca una franja que cubra la hora de inicio.
 * Si hay una franja "de ese tipo de día" (lunes a viernes / fin de semana)
 * gana a la de "todos los días"; si ninguna cubre, vale el precio base.
 */
export function precioDelTurno(c: { precioBaseCentavos: number; tarifas: Tarifa[] }, fecha: string, desde: string): number {
  const finde = diaDeLaSemana(fecha) >= 6;
  const hora = aMinutos(desde);
  const cubre = (t: Tarifa) => aMinutos(t.desde) <= hora && hora < aMinutos(t.hasta);
  const propia = c.tarifas.find((t) => t.dias === (finde ? 'finde' : 'semana') && cubre(t));
  const general = c.tarifas.find((t) => t.dias === 'todos' && cubre(t));
  return (propia ?? general)?.precioCentavos ?? c.precioBaseCentavos;
}

// ---------- Pagos ----------
export type EstadoDePago = 'sin_pago' | 'sena' | 'saldado';

/** Sin nada pagado, con una parte (seña) o completo. Un precio de $0 cuenta como saldado. */
export function estadoDePago(precioCentavos: number, pagadoCentavos: number): EstadoDePago {
  if (pagadoCentavos >= precioCentavos) return 'saldado';
  return pagadoCentavos > 0 ? 'sena' : 'sin_pago';
}

/** La seña que se propone: un porcentaje del precio, redondeado a $ 100 (nadie cobra $ 1.333). */
export function senaSugerida(precioCentavos: number, porcentaje: number): number {
  const cruda = (precioCentavos * porcentaje) / 100;
  return Math.min(precioCentavos, Math.round(cruda / 10_000) * 10_000);
}
