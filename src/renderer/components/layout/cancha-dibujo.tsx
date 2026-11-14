// Dibujos de las canchas (SVG con las líneas reglamentarias, simplificadas).
// Se usan en la cabecera de cada columna y en la lista de canchas.
import type { Deporte } from '@compartido/canchas';

/** Fútbol: cancha vista desde arriba, con las áreas y el círculo central. */
function Futbol({ linea }: { linea: string }) {
  return (
    <g fill="none" stroke={linea} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="42" height="66" rx="2.5" />
      <path d="M3 36h42" />
      <circle cx="24" cy="36" r="7" />
      <rect x="14" y="3" width="20" height="10" />
      <rect x="14" y="59" width="20" height="10" />
      <rect x="19" y="3" width="10" height="4.5" />
      <rect x="19" y="64.5" width="10" height="4.5" />
    </g>
  );
}

/** Pádel: cancha con la red al medio, las líneas de saque y las paredes de cristal. */
function Padel({ linea }: { linea: string }) {
  return (
    <g fill="none" stroke={linea} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="3" width="36" height="66" rx="3.5" strokeWidth="2.4" />
      <path d="M6 36h36" strokeDasharray="2.5 2.5" strokeWidth="2" />
      <path d="M6 20h36M6 52h36M24 20v32" />
    </g>
  );
}

/** El dibujo de una cancha. `fondo` pinta el césped o el piso; sin él, queda solo la línea. */
export function CanchaDibujo({ deporte, className = 'h-14 w-10', linea = '#fff', fondo = false }: { deporte: Deporte; className?: string; linea?: string; fondo?: boolean }) {
  return (
    <svg viewBox="0 0 48 72" className={className} aria-hidden="true">
      {fondo && <rect width="48" height="72" rx="5" fill={deporte === 'futbol' ? 'var(--fut)' : 'var(--pad)'} />}
      {deporte === 'futbol' ? <Futbol linea={linea} /> : <Padel linea={linea} />}
    </svg>
  );
}

/** Pelota decorativa (fútbol o pelota de pádel, que es amarilla). */
export function PelotaDibujo({ deporte, className = 'size-5' }: { deporte: Deporte; className?: string }) {
  return deporte === 'futbol' ? (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="#fff" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 7.2l3.8 2.8-1.4 4.4H9.6L8.2 10z" fill="currentColor" />
      <path d="M12 7.2V2.4M15.8 10l4.6-1.5M14.4 14.4l2.8 3.9M9.6 14.4l-2.8 3.9M8.2 10L3.6 8.5" stroke="currentColor" strokeWidth="1.4" fill="none" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="var(--pelota)" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3.4 8.2c4.2 1.2 7.2 4.4 8 9M20.6 15.8c-4.2-1.2-7.2-4.4-8-9" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
