// Canchas (solo administración): las canchas del complejo con su horario y sus precios.
import { useState } from 'react';
import { toast } from 'sonner';
import { Moon, Pencil, Plus, Umbrella } from 'lucide-react';
import { NOMBRE_DEPORTE, horariosDeCancha } from '@compartido/canchas';
import { pesos } from '@compartido/dinero';
import type { Cancha } from '@compartido/tipos';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CanchaDibujo } from '@/components/layout/cancha-dibujo';
import { desenvolver, canchas } from '@/lib/api';
import { cn } from '@/lib/utils';
import { CLAVES, useAccion, useCanchas, useCargarEjemplo } from '@/features/comun/consultas';
import { Encabezado, Vacio } from '@/features/comun/encabezado';
import { COLOR } from '@/features/reservas/estilos';
import { DialogoCancha } from './dialogo-cancha';

function resumenDePrecios(c: Cancha): string {
  const precios = [c.precioBaseCentavos, ...c.tarifas.map((t) => t.precioCentavos)];
  const menor = Math.min(...precios);
  const mayor = Math.max(...precios);
  return menor === mayor ? pesos(menor) : `${pesos(menor)} a ${pesos(mayor)}`;
}

export function PaginaCanchas() {
  const lista = useCanchas();
  const [editando, setEditando] = useState<{ cancha: Cancha | null } | null>(null);
  const cargarEjemplo = useCargarEjemplo();
  const activo = useAccion(({ id, a }: { id: number; a: boolean }) => desenvolver(canchas().canchas.cambiarActivo(id, a)), [CLAVES.canchas, CLAVES.reservas], 'Listo');
  const todas = lista.data ?? [];

  return (
    <div className="mx-auto flex max-w-[980px] flex-col gap-6 px-10 pt-9 pb-12">
      <Encabezado titulo="Canchas" detalle="Cada cancha tiene su deporte, su horario y sus precios. Si cambia el valor, las reservas que ya están dadas conservan el precio acordado.">
        <Button onClick={() => setEditando({ cancha: null })}>
          <Plus aria-hidden="true" /> Nueva cancha
        </Button>
      </Encabezado>
      {todas.length === 0 && !lista.isPending ? (
        <Vacio
          titulo="Todavía no hay canchas"
          acciones={
            <Button variant="outline" disabled={cargarEjemplo.isPending} onClick={() => cargarEjemplo.mutate()}>
              Cargar datos de ejemplo
            </Button>
          }
        >
          Cargá la primera con el botón "Nueva cancha", o probá el sistema con canchas, clientes y reservas de ejemplo.
        </Vacio>
      ) : (
        <ul className="grid grid-cols-2 gap-4">
          {todas.map((c) => {
            const color = COLOR[c.deporte];
            const noche = c.tarifas.some((t) => t.desde >= '19:00');
            return (
              <li key={c.id} className={cn('overflow-hidden rounded-2xl border border-linea bg-superficie', !c.activo && 'opacity-60')}>
                <div className={cn('flex items-center gap-4 bg-gradient-to-br px-5 py-4 text-white', color.cabecera)}>
                  <CanchaDibujo deporte={c.deporte} className="h-16 w-11 shrink-0 rounded-md bg-white/15 p-1" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-[24px] leading-none font-extrabold tracking-[-0.01em]">{c.nombre}</p>
                    <p className="mt-1.5 truncate text-[14px] text-white/85">{c.detalle || NOMBRE_DEPORTE[c.deporte]}</p>
                  </div>
                  {!c.activo && <Badge variant="contorno" className="border-white/60 text-white">De baja</Badge>}
                </div>
                <div className="flex flex-col gap-3 px-5 py-4">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-tinta-suave">
                    <span>
                      {c.duracionMin} min · {c.apertura} a {c.cierre}
                    </span>
                    <span>{horariosDeCancha(c.apertura, c.cierre, c.duracionMin).length} turnos por día</span>
                    {c.techada && (
                      <span className="flex items-center gap-1">
                        <Umbrella className="size-3.5" aria-hidden="true" /> Techada
                      </span>
                    )}
                    {noche && (
                      <span className="flex items-center gap-1">
                        <Moon className="size-3.5" aria-hidden="true" /> Precio de noche
                      </span>
                    )}
                  </div>
                  <p className="marcador text-[24px] leading-none">{resumenDePrecios(c)}</p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setEditando({ cancha: c })}>
                      <Pencil aria-hidden="true" /> Editar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => activo.mutate({ id: c.id, a: !c.activo }, { onError: (e) => toast.error(e.message) })}>
                      {c.activo ? 'Dar de baja' : 'Reactivar'}
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <DialogoCancha abierto={editando !== null} cancha={editando?.cancha ?? null} alCerrar={() => setEditando(null)} />
    </div>
  );
}
