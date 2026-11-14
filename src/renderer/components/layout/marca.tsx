/** Logo: una pelota sobre el círculo central de la cancha. */
export function Marca({ className = 'size-10' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <rect width="40" height="40" rx="11" fill="var(--acento)" />
      {/* líneas de la cancha */}
      <path d="M0 20h40" stroke="#fff" strokeOpacity=".55" strokeWidth="1.6" />
      <circle cx="20" cy="20" r="10.5" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="1.6" />
      {/* la pelota */}
      <circle cx="20" cy="20" r="6.2" fill="var(--pelota)" />
      <path d="M14.2 17.6c3.2.6 5.1 2.5 5.8 5.6M25.8 17.6c-3.2.6-5.1 2.5-5.8 5.6" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" strokeOpacity=".9" />
    </svg>
  );
}
