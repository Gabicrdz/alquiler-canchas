// La grilla del día: una columna por cancha y las horas hacia abajo. Cada turno
// se dibuja según su hora real (alto = duración), así las canchas de fútbol
// (60 min) y las de pádel (90 min) conviven en la misma pantalla.
import { Check, Plus, Umbrella } from 'lucide-react';
import { aMinutos } from '@compartido/horarios';
import { horariosDeCancha, precioDelTurno, sumarMinutos } from '@compartido/canchas';
import { pesos } from '@compartido/dinero';
import type { Cancha, Reserva } from '@compartido/tipos';
import { CanchaDibujo, PelotaDibujo } from '@/components/layout/cancha-dibujo';
import { cn } from '@/lib/utils';
import { COLOR, PX_HORA, PX_MINUTO } from './estilos';

interface Props {
  fecha: string;
  hoy: string;
  ahora: Date;
  canchas: Cancha[];
  /** Las reservas del DÍA (sin las canceladas). */
  reservas: Reserva[];
  alReservar: (cancha: Cancha, desde: string) => void;
  alAbrir: (reserva: Reserva) => void;
}

const dosCifras = (n: number) => String(n).padStart(2, '0');
const hora = (minutos: number) => `${dosCifras(Math.floor(minutos / 60))}:${dosCifras(minutos % 60)}`;

export function Grilla({ fecha, hoy, ahora, canchas, reservas, alReservar, alAbrir }: Props) {
  const inicio = Math.floor(Math.min(...canchas.map((c) => aMinutos(c.apertura))) / 60) * 60;
  const fin = Math.ceil(Math.max(...canchas.map((c) => aMinutos(c.cierre))) / 60) * 60;
  const alto = (fin - inicio) * PX_MINUTO;
  const horas = Array.from({ length: (fin - inicio) / 60 + 1 }, (_, i) => inicio + i * 60);
  const minutoAhora = ahora.getHours() * 60 + ahora.getMinutes();
  const esHoy = fecha === hoy;
  const hayAhora = esHoy && minutoAhora >= inicio && minutoAhora <= fin;
  const estilo = { '--hora': `${PX_HORA}px` } as React.CSSProperties;

  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-linea bg-superficie shadow-[0_1px_0_rgb(16_40_29/0.04)]">
      <div className="grid min-w-max" style={{ gridTemplateColumns: `68px repeat(${canchas.length}, minmax(196px, 1fr))` }}>
        {/* ── Fila de arriba: las canchas ── */}
        <div className="sticky top-0 left-0 z-30 border-b border-linea bg-superficie" />
        {canchas.map((c) => (
          <CabeceraCancha key={c.id} cancha={c} reservas={reservas.filter((r) => r.canchaId === c.id).length} />
        ))}

        {/* ── Columna de las horas ── */}
        <div className="sticky left-0 z-20 border-r border-linea bg-superficie" style={{ height: alto }}>
          <div className="relative" style={{ height: alto }}>
            {horas.map((m) => (
              <span key={m} className="marcador absolute right-2.5 -translate-y-1/2 text-[13px] text-tinta-suave" style={{ top: (m - inicio) * PX_MINUTO }}>
                {m === 24 * 60 ? '24:00' : hora(m)}
              </span>
            ))}
            {hayAhora && (
              <span className="marcador absolute right-1.5 z-10 -translate-y-1/2 rounded-md bg-pelota px-1.5 py-0.5 text-[12px] text-lateral shadow-sm" style={{ top: (minutoAhora - inicio) * PX_MINUTO }}>
                {hora(minutoAhora)}
              </span>
            )}
          </div>
        </div>

        {/* ── Una columna por cancha ── */}
        {canchas.map((c) => (
          <div key={c.id} className={cn('relative border-r border-linea last:border-r-0', COLOR[c.deporte].cesped)} style={{ ...estilo, height: alto }}>
            {horas.slice(1, -1).map((m) => (
              <div key={m} aria-hidden="true" className="absolute inset-x-0 border-t border-lateral/10" style={{ top: (m - inicio) * PX_MINUTO }} />
            ))}
            {aMinutos(c.apertura) > inicio && <div aria-hidden="true" className="cerrado absolute inset-x-0 top-0" style={{ height: (aMinutos(c.apertura) - inicio) * PX_MINUTO }} />}
            {aMinutos(c.cierre) < fin && <div aria-hidden="true" className="cerrado absolute inset-x-0 bottom-0" style={{ height: (fin - aMinutos(c.cierre)) * PX_MINUTO }} />}
            {horariosDeCancha(c.apertura, c.cierre, c.duracionMin).map((desde) => {
              const reserva = reservas.find((r) => r.canchaId === c.id && r.desde === desde);
              const hasta = sumarMinutos(desde, c.duracionMin);
              const posicion = { top: (aMinutos(desde) - inicio) * PX_MINUTO + 3, height: c.duracionMin * PX_MINUTO - 6 };
              if (reserva) return <Turno key={desde} reserva={reserva} cancha={c} posicion={posicion} alAbrir={() => alAbrir(reserva)} />;
              const termino = fecha < hoy || (esHoy && aMinutos(hasta) <= minutoAhora);
              const enJuego = esHoy && aMinutos(desde) <= minutoAhora && minutoAhora < aMinutos(hasta);
              return <Libre key={desde} cancha={c} fecha={fecha} desde={desde} hasta={hasta} posicion={posicion} termino={termino} enJuego={enJuego} alReservar={() => alReservar(c, desde)} />;
            })}
            {hayAhora && minutoAhora >= aMinutos(c.apertura) && minutoAhora <= aMinutos(c.cierre) && (
              <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-pelota-fuerte shadow-[0_0_0_1px_rgb(255_255_255/0.6)]" style={{ top: (minutoAhora - inicio) * PX_MINUTO }}>
                <span className="absolute -top-[3px] -left-1 size-2 rounded-full bg-pelota-fuerte" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Lo de arriba de cada columna: el dibujo de la cancha, el nombre y cuánto se llenó el día. */
function CabeceraCancha({ cancha, reservas }: { cancha: Cancha; reservas: number }) {
  const total = horariosDeCancha(cancha.apertura, cancha.cierre, cancha.duracionMin).length;
  const lleno = total ? reservas / total : 0;
  return (
    <div className={cn('sticky top-0 z-20 overflow-hidden border-r border-white/15 bg-gradient-to-br px-3.5 pt-3 pb-3 text-white last:border-r-0', COLOR[cancha.deporte].cabecera)}>
      {/* La cancha dibujada, enorme y casi transparente, de fondo */}
      <CanchaDibujo deporte={cancha.deporte} className="pointer-events-none absolute -top-3 -right-2 h-28 w-[75px] rotate-12 opacity-25" />
      <div className="relative flex items-center gap-2.5">
        <CanchaDibujo deporte={cancha.deporte} className="h-11 w-[30px] shrink-0 rounded-[5px] bg-white/15 p-[3px]" />
        <div className="min-w-0">
          <p className="truncate font-display text-[19px] leading-none font-extrabold tracking-[-0.01em]">{cancha.nombre}</p>
          <p className="mt-1 flex items-center gap-1 truncate text-[12px] text-white/80">
            {cancha.techada && <Umbrella className="size-3 shrink-0" aria-label="Techada" />}
            <span className="truncate">{cancha.detalle || (cancha.deporte === 'futbol' ? 'Fútbol' : 'Pádel')}</span>
          </p>
        </div>
      </div>
      <div className="relative mt-2.5 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/25" role="img" aria-label={`${reservas} de ${total} turnos reservados`}>
          <div className="h-full rounded-full bg-pelota" style={{ width: `${Math.round(lleno * 100)}%` }} />
        </div>
        <span className="marcador text-[12px] text-white/90">
          {reservas}/{total}
        </span>
      </div>
    </div>
  );
}

function Libre({
  cancha,
  fecha,
  desde,
  hasta,
  posicion,
  termino,
  enJuego,
  alReservar,
}: {
  cancha: Cancha;
  fecha: string;
  desde: string;
  hasta: string;
  posicion: { top: number; height: number };
  termino: boolean;
  enJuego: boolean;
  alReservar: () => void;
}) {
  const precio = precioDelTurno(cancha, fecha, desde);
  if (termino) {
    return (
      <div className="absolute inset-x-1.5 rounded-xl border border-lateral/10 bg-white/30 px-2.5 py-1.5 opacity-60" style={posicion}>
        <span className="text-[12px] text-tinta-suave">
          {desde} – {hasta}
        </span>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={alReservar}
      aria-label={`${cancha.nombre}, ${desde} a ${hasta}, libre. Reservar`}
      className={cn(
        'group absolute inset-x-1.5 flex flex-col justify-between rounded-xl border-2 border-dashed bg-white/45 px-2.5 py-1.5 text-left outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-pelota-fuerte',
        COLOR[cancha.deporte].libre,
        enJuego && 'border-solid ring-2 ring-pelota-fuerte',
      )}
      style={posicion}
    >
      <span className="flex items-center justify-between text-[12px] text-tinta-suave">
        <span>
          {desde} – {hasta}
        </span>
        {enJuego && <span className="rounded bg-pelota px-1 text-[11px] font-bold text-lateral">en juego</span>}
      </span>
      <span className="flex items-end justify-between">
        <span className="flex items-center gap-1 text-[13px] font-semibold opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <Plus className="size-4" aria-hidden="true" /> Reservar
        </span>
        <span className="marcador text-[16px] opacity-80 group-hover:opacity-100">{pesos(precio)}</span>
      </span>
    </button>
  );
}

/** El cartel de pago de una reserva: lo primero que mira el encargado. */
export function EtiquetaDePago({ reserva, className }: { reserva: Pick<Reserva, 'estadoDePago' | 'precioCentavos' | 'pagadoCentavos'>; className?: string }) {
  const debe = reserva.precioCentavos - reserva.pagadoCentavos;
  if (reserva.estadoDePago === 'saldado') {
    return (
      <span className={cn('inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[12px] font-bold text-verde', className)}>
        <Check className="size-3.5" strokeWidth={3} aria-hidden="true" /> Pagada
      </span>
    );
  }
  if (reserva.estadoDePago === 'sena') {
    return <span className={cn('rounded-full bg-pelota px-2 py-0.5 text-[12px] font-bold text-lateral', className)}>Seña · debe {pesos(debe)}</span>;
  }
  return <span className={cn('rounded-full bg-white px-2 py-0.5 text-[12px] font-bold text-rojo', className)}>Sin seña · {pesos(debe)}</span>;
}

function Turno({ reserva, cancha, posicion, alAbrir }: { reserva: Reserva; cancha: Cancha; posicion: { top: number; height: number }; alAbrir: () => void }) {
  const c = COLOR[cancha.deporte];
  const jugada = reserva.estado === 'jugada';
  const ausente = reserva.estado === 'ausente';
  return (
    <button
      type="button"
      onClick={alAbrir}
      aria-label={`${cancha.nombre}, ${reserva.desde} a ${reserva.hasta}, ${reserva.cliente}. Ver reserva`}
      className={cn(
        'absolute inset-x-1.5 flex flex-col justify-between overflow-hidden rounded-xl px-2.5 py-2 text-left shadow-[0_2px_6px_-2px_rgb(16_40_29/0.45)] outline-none transition-transform hover:-translate-y-px focus-visible:ring-[3px] focus-visible:ring-pelota-fuerte',
        !jugada && !ausente && cn('bg-gradient-to-br text-white', c.reserva),
        jugada && cn('border border-linea bg-white/85 text-tinta shadow-none'),
        ausente && 'rayas-rojas border border-rojo/40 bg-white/80 text-rojo shadow-none',
      )}
      style={posicion}
    >
      {jugada && <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-1.5', c.barra)} />}
      <span className="flex items-start justify-between gap-1.5">
        <span className="min-w-0">
          <span className="block truncate font-display text-[16px] leading-tight font-bold">{reserva.cliente}</span>
          <span className={cn('text-[12px]', !jugada && !ausente ? 'text-white/80' : 'text-tinta-suave')}>
            {reserva.desde} – {reserva.hasta}
          </span>
        </span>
        <PelotaDibujo deporte={cancha.deporte} className={cn('mt-0.5 size-[18px] shrink-0', !jugada && !ausente ? 'text-fut-fuerte' : 'text-tinta-suave opacity-70')} />
      </span>
      {ausente ? (
        <span className="text-[12px] font-bold">No vino{reserva.pagadoCentavos > 0 ? ` · seña ${pesos(reserva.pagadoCentavos)}` : ''}</span>
      ) : jugada ? (
        <span className="flex items-center gap-1 text-[12px] font-semibold text-tinta-suave">
          <Check className="size-3.5" strokeWidth={3} aria-hidden="true" /> Jugada{reserva.estadoDePago !== 'saldado' ? ` · debe ${pesos(reserva.precioCentavos - reserva.pagadoCentavos)}` : ''}
        </span>
      ) : (
        <EtiquetaDePago reserva={reserva} className="self-start" />
      )}
    </button>
  );
}
