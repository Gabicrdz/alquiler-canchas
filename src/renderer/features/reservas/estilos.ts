// Colores y medidas de la grilla. Las clases están escritas completas (y no
// armadas con texto) para que Tailwind las encuentre.
import type { Deporte } from '@compartido/canchas';

/** Alto en pantalla de una hora de cancha. La grilla entera se dibuja con esta escala. */
export const PX_HORA = 76;
export const PX_MINUTO = PX_HORA / 60;

export const COLOR: Record<
  Deporte,
  { cabecera: string; elegido: string; reserva: string; cesped: string; suave: string; texto: string; fuerte: string; borde: string; libre: string; barra: string }
> = {
  futbol: {
    cabecera: 'from-fut to-fut-fuerte',
    elegido: 'border-fut bg-fut-suave',
    reserva: 'from-fut to-fut-fuerte',
    cesped: 'cesped-futbol',
    suave: 'bg-fut-suave',
    texto: 'text-fut',
    fuerte: 'text-fut-fuerte',
    borde: 'border-fut/50',
    libre: 'border-fut/35 hover:border-fut hover:bg-white/80 text-fut-fuerte',
    barra: 'bg-fut',
  },
  padel: {
    cabecera: 'from-pad to-pad-fuerte',
    elegido: 'border-pad bg-pad-suave',
    reserva: 'from-pad to-pad-fuerte',
    cesped: 'cesped-padel',
    suave: 'bg-pad-suave',
    texto: 'text-pad',
    fuerte: 'text-pad-fuerte',
    borde: 'border-pad/50',
    libre: 'border-pad/35 hover:border-pad hover:bg-white/80 text-pad-fuerte',
    barra: 'bg-pad',
  },
};
