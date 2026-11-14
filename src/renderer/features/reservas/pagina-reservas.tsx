// Reservas: la pantalla principal. Arriba la semana, abajo la grilla del día
// con todas las canchas. Tocar un turno libre reserva; tocar uno ocupado lo abre.
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { addDays, format, parseISO } from 'date-fns';
import { ChevronLeft, ChevronRight, Goal } from 'lucide-react';
import { horariosDeCancha } from '@compartido/canchas';
import type { Cancha } from '@compartido/tipos';
import { Button } from '@/components/ui/button';
import { Encabezado, Vacio } from '@/features/comun/encabezado';
import { useCanchas, useCargarEjemplo, useReservas } from '@/features/comun/consultas';
import { useUsuario } from '@/features/sesion/consultas';
import { useAhora } from '@/lib/ahora';
import { fechaISO, fechaLarga } from '@/lib/fechas';
import { DetalleReserva } from './detalle-reserva';
import { DialogoReserva } from './dialogo-reserva';
import { diasDeLaSemana, FranjaSemana } from './franja-semana';
import { Grilla } from './grilla';

export function PaginaReservas() {
  const ahora = useAhora();
  const hoy = fechaISO(ahora);
  const [fecha, setFecha] = useState(() => fechaISO());
  const [nueva, setNueva] = useState<{ cancha: Cancha; desde: string } | null>(null);
  const [abierta, setAbierta] = useState<number | null>(null);
  const { esAdmin } = useUsuario();
  const cargarEjemplo = useCargarEjemplo();

  const semana = useMemo(() => diasDeLaSemana(fecha), [fecha]);
  const canchas = useCanchas();
  const reservas = useReservas({ desde: semana[0]!, hasta: semana[6]! });
  const activas = (canchas.data ?? []).filter((c) => c.activo);
  const delDia = (reservas.data ?? []).filter((r) => r.fecha === fecha);
  const reserva = (reservas.data ?? []).find((r) => r.id === abierta) ?? null;

  const dias = semana.map((f) => ({
    fecha: f,
    reservas: (reservas.data ?? []).filter((r) => r.fecha === f).length,
    total: activas.reduce((suma, c) => suma + horariosDeCancha(c.apertura, c.cierre, c.duracionMin).length, 0),
  }));

  const mover = (dias: number) => setFecha(format(addDays(parseISO(fecha), dias), 'yyyy-MM-dd'));

  if (canchas.isPending) return null;
  if (activas.length === 0) {
    return (
      <div className="mx-auto max-w-[900px] px-10 pt-9 pb-12">
        <Encabezado titulo="Reservas" detalle="Acá vas a ver todas las canchas y sus horarios." />
        <div className="mt-8">
          <Vacio
            titulo="Todavía no hay canchas cargadas"
            acciones={
              esAdmin ? (
                <>
                  <Button asChild>
                    <Link to="/canchas">
                      <Goal aria-hidden="true" /> Cargar mi primera cancha
                    </Link>
                  </Button>
                  <Button variant="outline" disabled={cargarEjemplo.isPending} onClick={() => cargarEjemplo.mutate()}>
                    Cargar datos de ejemplo
                  </Button>
                </>
              ) : undefined
            }
          >
            {esAdmin ? 'Cargá las canchas del complejo (con su precio y su horario) o probá el sistema con datos de ejemplo.' : 'Pedile a administración que cargue las canchas del complejo.'}
          </Vacio>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 px-8 pt-7 pb-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[38px] leading-none font-extrabold tracking-[-0.02em]">Reservas</h1>
          <p className="mt-2 text-[17px] font-semibold text-tinta first-letter:uppercase">{fechaLarga(fecha)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Día anterior" onClick={() => mover(-1)}>
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button variant="outline" onClick={() => setFecha(hoy)} disabled={fecha === hoy}>
            Hoy
          </Button>
          <Button variant="outline" size="icon" aria-label="Día siguiente" onClick={() => mover(1)}>
            <ChevronRight aria-hidden="true" />
          </Button>
          <div className="ml-2 flex items-center gap-4 text-[13px] text-tinta-suave" aria-label="Referencias">
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-sm bg-fut" aria-hidden="true" /> Fútbol
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-sm bg-pad" aria-hidden="true" /> Pádel
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-full bg-pelota" aria-hidden="true" /> Seña
            </span>
          </div>
        </div>
      </div>
      <FranjaSemana dias={dias} elegido={fecha} hoy={hoy} alElegir={setFecha} />
      {reservas.isError ? (
        <p role="alert" className="text-rojo">
          {reservas.error.message}
        </p>
      ) : (
        <Grilla fecha={fecha} hoy={hoy} ahora={ahora} canchas={activas} reservas={delDia} alReservar={(cancha, desde) => setNueva({ cancha, desde })} alAbrir={(r) => setAbierta(r.id)} />
      )}
      <DialogoReserva turno={nueva} fecha={fecha} alCerrar={() => setNueva(null)} />
      <DetalleReserva reserva={reserva} cancha={activas.find((c) => c.id === reserva?.canchaId) ?? (canchas.data ?? []).find((c) => c.id === reserva?.canchaId)} hoy={hoy} alCerrar={() => setAbierta(null)} />
    </div>
  );
}
