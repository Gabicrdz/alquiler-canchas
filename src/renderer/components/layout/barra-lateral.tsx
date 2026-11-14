// Barra lateral verde pino con las líneas de una cancha de fondo: nombre del
// complejo arriba, secciones al medio (según el rol), y abajo Ajustes y quién
// está usando el sistema.
import { NavLink } from 'react-router';
import { CalendarDays, Goal, Lock, Settings, UsersRound, type LucideIcon } from 'lucide-react';
import { NOMBRE_ROL } from '@compartido/tipos';
import { Button } from '@/components/ui/button';
import { Iniciales } from '@/features/sesion/iniciales';
import { useBloquear, useUsuario } from '@/features/sesion/consultas';
import { useComplejo } from '@/features/comun/consultas';
import { cn } from '@/lib/utils';
import { fechaLarga } from '@/lib/fechas';
import { Marca } from './marca';

const SECCIONES: { ruta: string; nombre: string; icono: LucideIcon; soloAdmin?: boolean }[] = [
  { ruta: '/', nombre: 'Reservas', icono: CalendarDays },
  { ruta: '/clientes', nombre: 'Clientes', icono: UsersRound },
  { ruta: '/canchas', nombre: 'Canchas', icono: Goal, soloAdmin: true },
];

function Enlace({ ruta, nombre, icono: Icono }: Omit<(typeof SECCIONES)[number], 'soloAdmin'>) {
  return (
    <NavLink
      to={ruta}
      end={ruta === '/'}
      className={({ isActive }) =>
        cn(
          'flex h-11 items-center gap-3 rounded-lg px-3 text-[15px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-pelota/70',
          isActive ? 'bg-white/14 text-white shadow-[inset_3px_0_0_var(--pelota)]' : 'text-white/70 hover:bg-white/8 hover:text-white',
        )
      }
    >
      <Icono className="size-[19px]" strokeWidth={1.9} aria-hidden="true" />
      {nombre}
    </NavLink>
  );
}

/** Las líneas de una cancha, enormes y casi invisibles, de fondo. */
function LineasDeFondo() {
  return (
    <svg aria-hidden="true" viewBox="0 0 240 360" className="pointer-events-none absolute -right-16 bottom-10 h-[420px] text-white/[0.06]" fill="none" stroke="currentColor" strokeWidth="3">
      <rect x="10" y="10" width="220" height="340" rx="10" />
      <path d="M10 180h220" />
      <circle cx="120" cy="180" r="40" />
      <rect x="55" y="10" width="130" height="56" />
      <rect x="55" y="294" width="130" height="56" />
    </svg>
  );
}

export function BarraLateral() {
  const complejo = useComplejo();
  const { usuario, esAdmin } = useUsuario();
  const bloquear = useBloquear();
  return (
    <aside className="relative flex h-full w-[236px] shrink-0 flex-col overflow-hidden bg-lateral px-4 py-5 text-white">
      <LineasDeFondo />
      <div className="relative flex items-center gap-3 px-1">
        <Marca />
        <div className="min-w-0">
          <p className="line-clamp-2 font-display text-[18px] leading-tight font-bold">{complejo.data?.nombre ?? ' '}</p>
          <p className="text-[13px] text-white/60">Reservas de canchas</p>
        </div>
      </div>
      <nav aria-label="Secciones" className="relative mt-8 flex flex-col gap-1">
        {SECCIONES.filter((s) => !s.soloAdmin || esAdmin).map((s) => (
          <Enlace key={s.ruta} ruta={s.ruta} nombre={s.nombre} icono={s.icono} />
        ))}
      </nav>
      <div className="relative mt-auto flex flex-col gap-3">
        {esAdmin && <Enlace ruta="/ajustes" nombre="Ajustes" icono={Settings} />}
        <p className="px-3 text-[13px] text-white/60 first-letter:uppercase">{fechaLarga(new Date())}</p>
        {usuario && (
          <div className="flex items-center gap-2.5 border-t border-white/15 px-1 pt-3">
            <Iniciales nombre={usuario.nombre} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] leading-tight font-semibold">{usuario.nombre}</p>
              <p className="text-[12px] text-white/60">{NOMBRE_ROL[usuario.rol]}</p>
            </div>
            <Button variant="ghost" size="icon-sm" className="text-white/80 hover:bg-white/10 hover:text-white" aria-label="Bloquear (salir)" title="Bloquear (salir)" disabled={bloquear.isPending} onClick={() => bloquear.mutate()}>
              <Lock aria-hidden="true" />
            </Button>
          </div>
        )}
      </div>
    </aside>
  );
}
