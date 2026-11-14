// Cuentas con horas y fechas. Funciones puras (sin base de datos).

/** ¿Es una hora 'HH:MM' válida (00:00 a 23:59)? */
export function esHora(texto: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(texto);
}

/** '08:30' → 510 (minutos desde la medianoche). '24:00' → 1440. */
export function aMinutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number) as [number, number];
  return h * 60 + m;
}

/** 510 → '08:30'. */
export function aHora(minutos: number): string {
  return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;
}

/** Día de la semana de una fecha 'AAAA-MM-DD' (1 = lunes … 7 = domingo). */
export function diaDeLaSemana(fecha: string): number {
  const d = new Date(`${fecha}T12:00:00`).getDay(); // 0 = domingo
  return d === 0 ? 7 : d;
}

export const NOMBRE_DIA: Record<number, string> = {
  1: 'lunes',
  2: 'martes',
  3: 'miércoles',
  4: 'jueves',
  5: 'viernes',
  6: 'sábado',
  7: 'domingo',
};
