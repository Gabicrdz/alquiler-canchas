// Líneas de una cancha de fútbol (arriba, verde) y una de pádel (abajo, azul),
// enormes y casi invisibles, para el fondo de la barra lateral y la portada.
export function LineasDobles({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 260 560" className={`pointer-events-none absolute text-white/[0.07] ${className}`} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      {/* fútbol */}
      <g>
        <rect x="10" y="10" width="170" height="250" rx="10" />
        <path d="M10 135h170" />
        <circle cx="95" cy="135" r="30" />
        <rect x="45" y="10" width="100" height="44" />
        <rect x="45" y="216" width="100" height="44" />
      </g>
      {/* pádel */}
      <g transform="translate(70 290)">
        <rect x="10" y="10" width="170" height="250" rx="14" strokeWidth="4" />
        <path d="M10 135h170" strokeDasharray="8 8" />
        <path d="M10 75h170M10 195h170M95 75v120" />
      </g>
    </svg>
  );
}
