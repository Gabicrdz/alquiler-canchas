/** Logo: la cancha de fútbol (verde) y la de pádel (azul) cortadas en diagonal, con la pelota en el medio. */
export function Marca({ className = 'size-10' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <defs>
        <clipPath id="marca-recorte">
          <rect width="40" height="40" rx="11" />
        </clipPath>
      </defs>
      <g clipPath="url(#marca-recorte)">
        <rect width="40" height="40" fill="var(--fut)" />
        <path d="M40 0v40H0z" fill="var(--pad)" />
        {/* fútbol: círculo central y área (mitad de arriba a la izquierda) */}
        <g fill="none" stroke="#fff" strokeOpacity=".6" strokeWidth="1.5">
          <circle cx="13" cy="13" r="6" />
          <path d="M3 3v12" />
          {/* pádel: red y líneas de saque (mitad de abajo a la derecha) */}
          <path d="M27 37V27M31 37V27M35 37V27" strokeDasharray="2 2" />
          <path d="M24 33h14" />
        </g>
        <path d="M40 0L0 40" stroke="#fff" strokeOpacity=".75" strokeWidth="1.6" />
      </g>
      {/* la pelota, sobre el corte */}
      <circle cx="20" cy="20" r="6.4" fill="var(--pelota)" stroke="#0b2a1e" strokeOpacity=".25" strokeWidth="1" />
      <path d="M16.6 15.8c2.4 2.4 2.4 6 0 8.4M23.4 15.8c-2.4 2.4-2.4 6 0 8.4" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
