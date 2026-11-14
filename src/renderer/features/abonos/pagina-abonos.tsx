// Abonos y bloqueos: los turnos fijos de todas las semanas, y los cierres de
// canchas (lluvia, mantenimiento, torneos).
import { useState } from 'react';
import { toast } from 'sonner';
import { Ban, CloudRain, Plus, Repeat, Trophy, Wrench, type LucideIcon } from 'lucide-react';
import { NOMBRE_DIA } from '@compartido/horarios';
import { NOMBRE_MOTIVO, type MotivoBloqueo } from '@compartido/canchas';
import { pesos } from '@compartido/dinero';
import type { Abono } from '@compartido/tipos';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CanchaDibujo } from '@/components/layout/cancha-dibujo';
import { Encabezado, Vacio } from '@/features/comun/encabezado';
import { CLAVES, useAbonos, useAccion, useBloqueosVigentes } from '@/features/comun/consultas';
import { COLOR } from '@/features/reservas/estilos';
import { DialogoBloqueo } from '@/features/reservas/dialogo-bloqueo';
import { useUsuario } from '@/features/sesion/consultas';
import { desenvolver, canchas } from '@/lib/api';
import { fechaISO, fechaLarga, rangoCorto } from '@/lib/fechas';
import { cn } from '@/lib/utils';
import { DialogoAbono } from './dialogo-abono';

const ICONO: Record<MotivoBloqueo, LucideIcon> = { lluvia: CloudRain, mantenimiento: Wrench, torneo: Trophy, otro: Ban };

export function PaginaAbonos() {
  const { esAdmin } = useUsuario();
  const abonos = useAbonos();
  const bloqueos = useBloqueosVigentes();
  const [nuevoAbono, setNuevoAbono] = useState(false);
  const [nuevoBloqueo, setNuevoBloqueo] = useState(false);
  const [terminando, setTerminando] = useState<Abono | null>(null);

  const terminar = useAccion((d: { id: number; devolverSena: boolean }) => desenvolver(canchas().abonos.terminar(d)), [CLAVES.abonos, CLAVES.reservas], (n) =>
    n === 0 ? 'Abono terminado' : `Abono terminado: se ${n === 1 ? 'canceló 1 turno' : `cancelaron ${n} turnos`}`,
  );
  const quitar = useAccion((id: number) => desenvolver(canchas().bloqueos.quitar(id)), [CLAVES.bloqueos, CLAVES.reservas], 'Bloqueo quitado');

  const vigentes = (abonos.data ?? []).filter((a) => a.activo);
  const terminados = (abonos.data ?? []).filter((a) => !a.activo);

  return (
    <div className="mx-auto max-w-[1000px] px-10 pt-9 pb-12">
      <Encabezado titulo="Abonos y bloqueos" detalle="Los turnos fijos de todas las semanas y los cierres de canchas." />
      <Tabs defaultValue="abonos" className="mt-4">
        <TabsList>
          <TabsTrigger value="abonos">
            <Repeat className="size-[18px]" aria-hidden="true" /> Abonos {vigentes.length > 0 && <span className="marcador text-[13px] text-tinta-suave">{vigentes.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="bloqueos">
            <CloudRain className="size-[18px]" aria-hidden="true" /> Bloqueos {(bloqueos.data?.length ?? 0) > 0 && <span className="marcador text-[13px] text-tinta-suave">{bloqueos.data?.length}</span>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="abonos" className="pt-5">
          <div className="mb-4 flex items-center justify-between gap-4">
            <p className="max-w-lg text-[15px] text-tinta-suave">Un abono reserva el mismo turno cada semana. Los turnos aparecen en la grilla (con 8 semanas de anticipación) y se cobran como cualquier reserva.</p>
            <Button onClick={() => setNuevoAbono(true)}>
              <Plus aria-hidden="true" /> Nuevo abono
            </Button>
          </div>
          {abonos.isPending ? null : vigentes.length === 0 ? (
            <Vacio titulo="Todavía no hay abonos">Cargá el equipo que juega todos los martes a las 21:00 y se reserva solo, semana tras semana.</Vacio>
          ) : (
            <ul className="grid grid-cols-2 gap-4">
              {vigentes.map((a) => (
                <TarjetaAbono key={a.id} abono={a} alTerminar={esAdmin ? () => setTerminando(a) : undefined} />
              ))}
            </ul>
          )}
          {terminados.length > 0 && (
            <section className="mt-8" aria-label="Abonos terminados">
              <h2 className="mb-2 text-sm font-semibold text-tinta-suave">Terminados</h2>
              <ul className="divide-y divide-linea rounded-xl border border-linea bg-superficie text-[14px] text-tinta-suave">
                {terminados.map((a) => (
                  <li key={a.id} className="flex items-center justify-between px-4 py-2.5">
                    <span>
                      {a.cliente} · {NOMBRE_DIA[a.diaSemana]} {a.desde} · {a.cancha}
                    </span>
                    <span>{a.hastaFecha ? `hasta el ${rangoCorto(a.hastaFecha, a.hastaFecha)}` : ''}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </TabsContent>

        <TabsContent value="bloqueos" className="pt-5">
          <div className="mb-4 flex items-center justify-between gap-4">
            <p className="max-w-lg text-[15px] text-tinta-suave">Cuando llueve o hay que arreglar una cancha, bloqueala: nadie puede reservar en ese horario. También se bloquea desde Reservas.</p>
            <Button onClick={() => setNuevoBloqueo(true)}>
              <Plus aria-hidden="true" /> Nuevo bloqueo
            </Button>
          </div>
          {bloqueos.isPending ? null : (bloqueos.data ?? []).length === 0 ? (
            <Vacio titulo="No hay bloqueos">Las canchas están todas disponibles.</Vacio>
          ) : (
            <ul className="flex flex-col gap-3">
              {(bloqueos.data ?? []).map((b) => {
                const Icono = ICONO[b.motivo];
                return (
                  <li key={b.id} className="flex items-center gap-4 rounded-xl border border-linea bg-superficie px-4 py-3.5">
                    <span className="cerrado flex size-12 shrink-0 items-center justify-center rounded-xl border border-lateral/15 text-tinta-suave">
                      <Icono className="size-6" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-[18px] leading-tight font-bold">
                        {NOMBRE_MOTIVO[b.motivo]}
                        {b.nota ? <span className="font-sans text-[15px] font-normal text-tinta-suave"> · {b.nota}</span> : null}
                      </p>
                      <p className="text-[14px] text-tinta-suave">
                        {b.cancha ?? 'Todas las canchas'} · {rangoCorto(b.fechaDesde, b.fechaHasta)} · {b.desde && b.hasta ? `${b.desde} a ${b.hasta}` : 'todo el día'}
                      </p>
                    </div>
                    <Button variant="ghost-destructive" size="sm" disabled={quitar.isPending} onClick={() => quitar.mutate(b.id, { onError: (e) => toast.error(e.message) })}>
                      Quitar
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>
      </Tabs>

      <DialogoAbono abierto={nuevoAbono} alCerrar={() => setNuevoAbono(false)} />
      <DialogoBloqueo abierto={nuevoBloqueo} fechaInicial={fechaISO()} alCerrar={() => setNuevoBloqueo(false)} />

      <Dialog open={terminando !== null} onOpenChange={(a) => !a && setTerminando(null)}>
        <DialogContent className="max-w-[520px]">
          {terminando && (
            <>
              <DialogHeader>
                <DialogTitle>¿Terminar el abono de {terminando.cliente}?</DialogTitle>
                <DialogDescription>
                  Se cancelan los {terminando.pendientes} turnos que todavía no se jugaron ({NOMBRE_DIA[terminando.diaSemana]} {terminando.desde} · {terminando.cancha}). Los ya jugados quedan como están.
                </DialogDescription>
              </DialogHeader>
              <DialogBody className="flex flex-col gap-2">
                <p className="text-[14px] font-medium">Si ya habían pagado algo de esos turnos:</p>
                <Button variant="destructive" disabled={terminar.isPending} onClick={() => terminar.mutate({ id: terminando.id, devolverSena: true }, { onSuccess: () => setTerminando(null), onError: (e) => toast.error(e.message) })}>
                  Terminar y devolver lo pagado
                </Button>
                <Button variant="outline" disabled={terminar.isPending} onClick={() => terminar.mutate({ id: terminando.id, devolverSena: false }, { onSuccess: () => setTerminando(null), onError: (e) => toast.error(e.message) })}>
                  Terminar y quedarse lo pagado
                </Button>
              </DialogBody>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setTerminando(null)}>
                  No, volver
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TarjetaAbono({ abono, alTerminar }: { abono: Abono; alTerminar?: () => void }) {
  const c = COLOR[abono.deporte];
  return (
    <li className="flex overflow-hidden rounded-xl border border-linea bg-superficie shadow-[0_1px_0_rgb(16_40_29/0.04)]">
      <div className={cn('flex w-[72px] shrink-0 items-center justify-center bg-gradient-to-b', c.cabecera)}>
        <CanchaDibujo deporte={abono.deporte} className="h-16 w-11" />
      </div>
      <div className="min-w-0 flex-1 p-4">
        <p className="truncate font-display text-[20px] leading-tight font-bold">{abono.cliente}</p>
        <p className="mt-0.5 text-[15px] font-semibold first-letter:uppercase">
          {NOMBRE_DIA[abono.diaSemana]} <span className="marcador">{abono.desde}</span> a {abono.hasta}
        </p>
        <p className="text-[14px] text-tinta-suave">
          {abono.cancha} · <span className="marcador">{pesos(abono.precioCentavos)}</span> por turno
        </p>
        <p className="mt-2 text-[13px] text-tinta-suave">
          {abono.proxima ? (
            <>
              Próximo: <span className="font-semibold text-tinta first-letter:uppercase">{fechaLarga(abono.proxima)}</span> · {abono.pendientes} cargados
            </>
          ) : (
            'Sin turnos pendientes'
          )}
          {abono.hastaFecha ? ` · hasta el ${rangoCorto(abono.hastaFecha, abono.hastaFecha)}` : ''}
        </p>
        {alTerminar && (
          <Button variant="ghost-destructive" size="sm" className="mt-2 -ml-2" onClick={alTerminar}>
            Terminar abono
          </Button>
        )}
      </div>
    </li>
  );
}
