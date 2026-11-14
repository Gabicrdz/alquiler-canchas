// La semana de un vistazo: siete fichas, una por día, con cuánto se llenó cada uno.
import { addDays, format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';

export interface DiaDeLaSemana {
  fecha: string;
  reservas: number;
  total: number;
}

export function FranjaSemana({ dias, elegido, hoy, alElegir }: { dias: DiaDeLaSemana[]; elegido: string; hoy: string; alElegir: (fecha: string) => void }) {
  return (
    <ol className="grid grid-cols-7 gap-2" aria-label="Días de la semana">
      {dias.map((d) => {
        const fecha = parseISO(d.fecha);
        const activo = d.fecha === elegido;
        const esHoy = d.fecha === hoy;
        const lleno = d.total ? d.reservas / d.total : 0;
        return (
          <li key={d.fecha}>
            <button
              type="button"
              onClick={() => alElegir(d.fecha)}
              aria-current={activo ? 'date' : undefined}
              aria-label={`${format(fecha, "EEEE d 'de' MMMM", { locale: es })}: ${d.reservas} de ${d.total} turnos reservados${esHoy ? ' (hoy)' : ''}`}
              className={cn(
                'relative flex w-full flex-col gap-1.5 rounded-xl border px-3 py-2 text-left outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-acento/40',
                activo ? 'border-lateral bg-lateral text-white' : 'border-linea bg-superficie hover:border-linea-fuerte hover:bg-accent',
                esHoy && !activo && 'ring-2 ring-pelota-fuerte',
              )}
            >
              <span className="flex items-baseline justify-between">
                <span className={cn('text-[12px] font-semibold tracking-wide uppercase', activo ? 'text-white/70' : 'text-tinta-suave')}>{format(fecha, 'EEE', { locale: es })}</span>
                {esHoy && <span className={cn('rounded px-1 text-[11px] font-bold', activo ? 'bg-pelota text-lateral' : 'bg-pelota text-lateral')}>HOY</span>}
              </span>
              <span className="flex items-end justify-between">
                <span className="marcador text-[26px] leading-none">{format(fecha, 'd')}</span>
                <span className={cn('numeros text-[12px]', activo ? 'text-white/75' : 'text-tinta-suave')}>
                  {d.reservas}/{d.total}
                </span>
              </span>
              <span className={cn('h-1.5 overflow-hidden rounded-full', activo ? 'bg-white/20' : 'bg-secondary')} aria-hidden="true">
                <span className={cn('block h-full rounded-full', activo ? 'bg-pelota' : 'bg-acento')} style={{ width: `${Math.round(lleno * 100)}%` }} />
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** Los siete días (lunes a domingo) de la semana que contiene a `fecha`. */
export function diasDeLaSemana(fecha: string): string[] {
  const d = parseISO(fecha);
  const lunes = addDays(d, -((d.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => format(addDays(lunes, i), 'yyyy-MM-dd'));
}
