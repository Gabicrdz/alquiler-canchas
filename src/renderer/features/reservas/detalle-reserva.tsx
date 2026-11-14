// El detalle de una reserva: quién es, cómo va de pagos, cobrar el saldo,
// marcar si jugó o no vino, y cancelar (decidiendo qué pasa con la seña).
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Ban, CalendarClock, MoveRight, Phone, Repeat, Undo2 } from 'lucide-react';
import { METODOS, NOMBRE_METODO } from '@compartido/esquemas';
import { estadosPosibles, NOMBRE_ESTADO, sePuedeCancelar, type EstadoReserva } from '@compartido/canchas';
import { pesos } from '@compartido/dinero';
import type { Cancha, Reserva } from '@compartido/tipos';
import { Button } from '@/components/ui/button';
import { CampoPesos } from '@/components/ui/campo-pesos';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CanchaDibujo } from '@/components/layout/cancha-dibujo';
import { desenvolver, canchas } from '@/lib/api';
import { fechaLarga } from '@/lib/fechas';
import { cn } from '@/lib/utils';
import { CLAVES, useAccion, useCanchas } from '@/features/comun/consultas';
import { useUsuario } from '@/features/sesion/consultas';
import { COLOR } from './estilos';
import { BotonAviso } from '@/features/reportes/boton-aviso';
import { DialogoMover } from './dialogo-mover';

export function DetalleReserva({ reserva, cancha, hoy, alCerrar }: { reserva: Reserva | null; cancha: Cancha | undefined; hoy: string; alCerrar: () => void }) {
  const { esAdmin } = useUsuario();
  const [monto, setMonto] = useState<number | null>(0);
  const [metodo, setMetodo] = useState<(typeof METODOS)[number]>('efectivo');
  const [cancelando, setCancelando] = useState(false);
  const [moviendo, setMoviendo] = useState(false);
  const todasLasCanchas = useCanchas();
  const [error, setError] = useState('');

  const saldo = reserva ? reserva.precioCentavos - reserva.pagadoCentavos : 0;
  // El monto a cobrar propone lo que falta (y se actualiza al cobrar o anular un pago)
  useEffect(() => {
    setMonto(saldo);
    setError('');
  }, [reserva?.id, saldo]);
  useEffect(() => {
    setCancelando(false);
    setMoviendo(false);
  }, [reserva?.id]);

  const refrescar = [CLAVES.reservas, CLAVES.clientes, CLAVES.abonos];
  const cobrar = useAccion((d: { reservaId: number; montoCentavos: number; metodo: (typeof METODOS)[number] }) => desenvolver(canchas().pagos.registrar(d)), refrescar, 'Pago registrado');
  const anular = useAccion((id: number) => desenvolver(canchas().pagos.anular(id)), refrescar, 'Pago anulado');
  const estado = useAccion(({ id, e }: { id: number; e: EstadoReserva }) => desenvolver(canchas().reservas.cambiarEstado(id, e)), refrescar, 'Listo');
  const cancelar = useAccion((d: { id: number; devolverSena: boolean }) => desenvolver(canchas().reservas.cancelar(d)), refrescar, 'Reserva cancelada');

  const c = cancha ? COLOR[cancha.deporte] : COLOR.futbol;
  const posibles = reserva ? estadosPosibles(reserva.estado, reserva.fecha, hoy) : [];
  const puedeCobrar = reserva && (reserva.estado === 'reservada' || reserva.estado === 'jugada') && saldo > 0;
  const porcentaje = reserva && reserva.precioCentavos > 0 ? Math.min(100, Math.round((reserva.pagadoCentavos / reserva.precioCentavos) * 100)) : 100;

  function hacerCobro() {
    if (!reserva) return;
    if (!monto) return setError('Escribí cuánto paga.');
    setError('');
    cobrar.mutate({ reservaId: reserva.id, montoCentavos: monto, metodo }, { onError: (e) => setError(e.message) });
  }

  return (
    <>
    <Dialog open={reserva !== null && !moviendo} onOpenChange={(a) => !a && alCerrar()}>
      <DialogContent className="max-w-[560px] [&>button[aria-label=Cerrar]]:text-white [&>button[aria-label=Cerrar]]:hover:bg-white/15 [&>button[aria-label=Cerrar]]:hover:text-white">
        {reserva && cancha && (
          <>
            <DialogHeader className="pb-1">
              <div className={cn('-ml-6 -mr-16 -mt-6 mb-3 flex items-center gap-4 rounded-t-xl bg-gradient-to-br px-6 py-4 pr-16 text-white', c.cabecera)}>
                <CanchaDibujo deporte={cancha.deporte} className="h-16 w-11 shrink-0 rounded-md bg-white/15 p-1" />
                <div className="min-w-0">
                  <DialogTitle className="truncate text-white">{reserva.cliente}</DialogTitle>
                  <DialogDescription className="text-white/85 first-letter:uppercase">
                    {cancha.nombre} · {fechaLarga(reserva.fecha)} · {reserva.desde} a {reserva.hasta}
                  </DialogDescription>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-tinta-suave">
                <span className={cn('rounded-full px-2.5 py-0.5 text-[13px] font-bold', c.suave, c.fuerte)}>{NOMBRE_ESTADO[reserva.estado]}</span>
                {reserva.telefono && (
                  <span className="flex items-center gap-1">
                    <Phone className="size-3.5" aria-hidden="true" /> {reserva.telefono}
                  </span>
                )}
                {reserva.abonoId !== null && (
                  <span className="flex items-center gap-1 font-semibold text-acento">
                    <Repeat className="size-3.5" aria-hidden="true" /> Abono (turno fijo)
                  </span>
                )}
                {reserva.nota && <span>“{reserva.nota}”</span>}
              </div>
            </DialogHeader>
            <DialogBody className="flex flex-col gap-5">
              {/* ── Plata ── */}
              <section aria-label="Pagos" className="rounded-xl border border-linea p-4">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-[13px] text-tinta-suave">Precio</p>
                    <p className="marcador text-[26px] leading-none">{pesos(reserva.precioCentavos)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[13px] text-tinta-suave">{saldo > 0 ? 'Falta cobrar' : 'Pagada'}</p>
                    <p className={cn('marcador text-[26px] leading-none', saldo > 0 ? 'text-rojo' : 'text-verde')}>{saldo > 0 ? pesos(saldo) : '✓'}</p>
                  </div>
                </div>
                <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-secondary" role="img" aria-label={`${porcentaje} % pagado`}>
                  <div className={cn('h-full rounded-full', saldo > 0 ? 'bg-pelota-fuerte' : 'bg-verde')} style={{ width: `${porcentaje}%` }} />
                </div>
                {reserva.pagos.length > 0 && (
                  <ul className="mt-3 divide-y divide-linea text-[14px]">
                    {reserva.pagos.map((p) => (
                      <li key={p.id} className="flex items-center gap-3 py-2">
                        <span className="marcador w-24 text-[16px]">{pesos(p.montoCentavos)}</span>
                        <span className="flex-1 text-tinta-suave">
                          {NOMBRE_METODO[p.metodo]} · {p.creadoEn.slice(8, 10)}/{p.creadoEn.slice(5, 7)} {p.creadoEn.slice(11, 16)}
                          {p.usuario ? ` · ${p.usuario}` : ''}
                        </span>
                        {(esAdmin || p.creadoEn.slice(0, 10) === hoy) && (
                          <Button variant="ghost-destructive" size="sm" disabled={anular.isPending} onClick={() => anular.mutate(p.id, { onError: (e) => toast.error(e.message) })}>
                            Anular
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {puedeCobrar && (
                  <div className="mt-4 flex flex-col gap-3 border-t border-linea pt-4">
                    <div className="flex items-end gap-3">
                      <div className="w-[170px]">
                        <label htmlFor="d-monto" className="mb-2 block text-sm font-medium">
                          Cobrar
                        </label>
                        <CampoPesos id="d-monto" valor={monto} alCambiar={setMonto} />
                      </div>
                      <div role="radiogroup" aria-label="Cómo paga" className="flex flex-wrap gap-1.5">
                        {METODOS.map((m) => (
                          <button
                            key={m}
                            type="button"
                            role="radio"
                            aria-checked={metodo === m}
                            onClick={() => setMetodo(m)}
                            className={cn(
                              'h-11 rounded-full border px-3 text-[13px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-acento/50',
                              metodo === m ? 'border-acento bg-acento text-white' : 'border-linea-fuerte bg-superficie hover:bg-accent',
                            )}
                          >
                            {NOMBRE_METODO[m]}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Button onClick={hacerCobro} disabled={cobrar.isPending}>
                        Cobrar {monto ? pesos(monto) : ''}
                      </Button>
                      {monto !== saldo && (
                        <Button variant="ghost" size="sm" onClick={() => setMonto(saldo)}>
                          Cobrar todo lo que falta ({pesos(saldo)})
                        </Button>
                      )}
                    </div>
                    {error && (
                      <p role="alert" className="text-[14px] font-medium text-rojo">
                        {error}
                      </p>
                    )}
                  </div>
                )}
              </section>

              {/* ── Cancelar: hay que decidir qué pasa con la seña ── */}
              {cancelando && (
                <section aria-label="Cancelar la reserva" className="rounded-xl border border-rojo/30 bg-rojo-suave p-4">
                  <p className="font-semibold text-rojo">¿Cancelar la reserva de {reserva.cliente}?</p>
                  <p className="mt-1 text-[14px] text-tinta">El horario queda libre para otro cliente.</p>
                  {reserva.pagadoCentavos > 0 ? (
                    <div className="mt-3 flex flex-col gap-2">
                      <p className="text-[14px] font-medium">Ya pagó {pesos(reserva.pagadoCentavos)}. ¿Qué hacés con eso?</p>
                      <Button variant="destructive" onClick={() => cancelar.mutate({ id: reserva.id, devolverSena: true }, { onSuccess: alCerrar, onError: (e) => toast.error(e.message) })}>
                        Devolverle los {pesos(reserva.pagadoCentavos)} (se anulan los pagos)
                      </Button>
                      <Button variant="outline" onClick={() => cancelar.mutate({ id: reserva.id, devolverSena: false }, { onSuccess: alCerrar, onError: (e) => toast.error(e.message) })}>
                        Quedarse la seña (cancelación tardía)
                      </Button>
                    </div>
                  ) : (
                    <Button className="mt-3" variant="destructive" onClick={() => cancelar.mutate({ id: reserva.id, devolverSena: false }, { onSuccess: alCerrar, onError: (e) => toast.error(e.message) })}>
                      Sí, cancelar la reserva
                    </Button>
                  )}
                  <Button className="mt-2" variant="ghost" size="sm" onClick={() => setCancelando(false)}>
                    No, volver
                  </Button>
                </section>
              )}
            </DialogBody>
            <DialogFooter className="flex-wrap sm:justify-between">
              <div className="flex flex-wrap gap-2">
                {posibles.includes('jugada') && (
                  <Button variant="outline" disabled={estado.isPending} onClick={() => estado.mutate({ id: reserva.id, e: 'jugada' }, { onSuccess: alCerrar, onError: (e) => toast.error(e.message) })}>
                    Marcar como jugada
                  </Button>
                )}
                {posibles.includes('ausente') && (
                  <Button variant="outline" disabled={estado.isPending} onClick={() => estado.mutate({ id: reserva.id, e: 'ausente' }, { onSuccess: alCerrar, onError: (e) => toast.error(e.message) })}>
                    <Ban aria-hidden="true" /> No vino
                  </Button>
                )}
                {posibles.includes('reservada') && (
                  <Button variant="outline" disabled={estado.isPending} onClick={() => estado.mutate({ id: reserva.id, e: 'reservada' }, { onSuccess: alCerrar, onError: (e) => toast.error(e.message) })}>
                    <Undo2 aria-hidden="true" /> Volver a pendiente
                  </Button>
                )}
                {reserva.estado === 'reservada' && <BotonAviso reservaId={reserva.id} tipo="recordatorio">Recordar por WhatsApp</BotonAviso>}
                {saldo > 0 && reserva.estado !== 'cancelada' && <BotonAviso reservaId={reserva.id} tipo="cobro">Reclamar saldo</BotonAviso>}
                {reserva.estado === 'reservada' && reserva.fecha > hoy && (
                  <span className="flex items-center gap-1.5 text-[13px] text-tinta-suave">
                    <CalendarClock className="size-4" aria-hidden="true" /> Se marca como jugada el día del partido
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                {reserva.estado === 'reservada' && (
                  <Button variant="outline" onClick={() => setMoviendo(true)}>
                    <MoveRight aria-hidden="true" /> Mover
                  </Button>
                )}
                {sePuedeCancelar(reserva.estado) && !cancelando && (
                  <Button variant="ghost-destructive" onClick={() => setCancelando(true)}>
                    Cancelar reserva
                  </Button>
                )}
                <Button variant="outline" onClick={alCerrar}>
                  Cerrar
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
      <DialogoMover reserva={moviendo ? reserva : null} canchas={(todasLasCanchas.data ?? []).filter((x) => x.activo)} hoy={hoy} alCerrar={() => setMoviendo(false)} alMover={alCerrar} />
    </>
  );
}
