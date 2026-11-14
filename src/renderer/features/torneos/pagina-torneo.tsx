// Un torneo por dentro: equipos (con su inscripción), fixture, tabla de posiciones.
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { ArrowLeft, CalendarClock, Check, CircleDollarSign, Flag, ListOrdered, Printer, Swords, Trash2, Trophy, UserPlus, Users } from 'lucide-react';
import { NOMBRE_DEPORTE } from '@compartido/canchas';
import { pesos } from '@compartido/dinero';
import { NOMBRE_ESTADO_TORNEO, NOMBRE_METODO } from '@compartido/esquemas';
import type { DetalleTorneo, Equipo, Partido } from '@compartido/tipos';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Imprimible } from '@/components/layout/imprimible';
import { Vacio } from '@/features/comun/encabezado';
import { CLAVES, useAccion, useComplejo, useTorneo } from '@/features/comun/consultas';
import { COLOR } from '@/features/reservas/estilos';
import { useUsuario } from '@/features/sesion/consultas';
import { desenvolver, canchas } from '@/lib/api';
import { fechaCorta, fechaISO, rangoCorto } from '@/lib/fechas';
import { cn } from '@/lib/utils';
import { DialogoCobroEquipo } from './dialogo-cobro-equipo';
import { DialogoPartido } from './dialogo-partido';

const NOMBRE_PAGO = { sin_pago: 'Sin pagar', sena: 'Pagó una parte', saldado: 'Pagó' } as const;

function Tabla({ t }: { t: DetalleTorneo }) {
  return (
    <table className="w-full text-[14px]">
      <caption className="sr-only">Tabla de posiciones</caption>
      <thead>
        <tr className="border-b border-linea text-left text-[12px] text-tinta-suave">
          <th scope="col" className="w-8 py-2">#</th>
          <th scope="col">Equipo</th>
          {['PJ', 'G', 'E', 'P', 'GF', 'GC', 'DG'].map((c) => (
            <th key={c} scope="col" className="w-11 text-right">{c}</th>
          ))}
          <th scope="col" className="w-14 text-right">Pts</th>
        </tr>
      </thead>
      <tbody>
        {t.posiciones.map((p, i) => (
          <tr key={p.equipoId} className="border-b border-linea last:border-0">
            <td className="marcador py-2 text-tinta-suave">{i + 1}</td>
            <td className="font-semibold">{p.nombre}</td>
            {[p.pj, p.pg, p.pe, p.pp, p.gf, p.gc, p.dg > 0 ? `+${p.dg}` : p.dg].map((v, j) => (
              <td key={j} className="numeros text-right">{v}</td>
            ))}
            <td className="marcador text-right text-[17px]">{p.pts}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FixtureImpreso({ t, complejo }: { t: DetalleTorneo; complejo: string }) {
  const rondas = [...new Set(t.listaDePartidos.map((p) => p.ronda))];
  return (
    <div className="p-4 text-[13px]" style={{ fontFamily: 'Figtree, sans-serif' }}>
      <p className="text-[12px] uppercase tracking-wide">{complejo}</p>
      <h1 className="text-[26px] font-bold">{t.nombre}</h1>
      <p className="mb-4">
        {NOMBRE_DEPORTE[t.deporte]} · {rangoCorto(t.fechaDesde, t.fechaHasta)}
      </p>
      <h2 className="mb-1 text-[16px] font-bold">Tabla de posiciones</h2>
      <Tabla t={t} />
      <h2 className="mt-5 mb-1 text-[16px] font-bold">Fixture</h2>
      {rondas.map((r) => (
        <div key={r} className="mb-3 break-inside-avoid">
          <p className="font-bold">Fecha {r}</p>
          {t.listaDePartidos
            .filter((p) => p.ronda === r)
            .map((p) => (
              <p key={p.id} className="flex justify-between border-b border-dotted border-black py-0.5">
                <span>
                  {p.local} vs {p.visitante}
                </span>
                <span>
                  {p.golesLocal !== null ? `${p.golesLocal} - ${p.golesVisitante}` : p.fecha ? `${fechaCorta(p.fecha)} ${p.hora} h${p.cancha ? ` · ${p.cancha}` : ''}` : 'a confirmar'}
                </span>
              </p>
            ))}
        </div>
      ))}
    </div>
  );
}

function ConfirmarFixture({ abierto, torneo, alCerrar }: { abierto: boolean; torneo: DetalleTorneo; alCerrar: () => void }) {
  const [idaYVuelta, setIdaYVuelta] = useState(false);
  const [error, setError] = useState('');
  const armar = useAccion((d: { torneoId: number; idaYVuelta: boolean }) => desenvolver(canchas().torneos.generarFixture(d)), [CLAVES.torneos], (n) => `Fixture armado: ${n} partidos`);
  const equipos = torneo.equipos;
  const partidos = (equipos * (equipos - 1)) / 2 * (idaYVuelta ? 2 : 1);
  return (
    <Dialog open={abierto} onOpenChange={(a) => !a && alCerrar()}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Armar el fixture</DialogTitle>
          <DialogDescription>Todos contra todos. Después no se pueden anotar ni sacar equipos.</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3">
          <label className="flex cursor-pointer items-center gap-2.5 text-[15px] font-medium">
            <input type="checkbox" className="size-[18px] accent-[var(--acento)]" checked={idaYVuelta} onChange={(e) => setIdaYVuelta(e.target.checked)} />
            Ida y vuelta
          </label>
          <p className="text-[14px] text-tinta-suave">
            Con {equipos} equipos van a ser {partidos} partidos.
          </p>
          <p role="alert" className="text-[14px] font-medium text-rojo">{error}</p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={alCerrar}>Cancelar</Button>
          <Button disabled={armar.isPending} onClick={() => armar.mutate({ torneoId: torneo.id, idaYVuelta }, { onSuccess: alCerrar, onError: (e) => setError(e.message) })}>
            Armar fixture
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PaginaTorneo() {
  const { id } = useParams();
  const navegar = useNavigate();
  const { esAdmin } = useUsuario();
  const torneo = useTorneo(Number(id));
  const complejo = useComplejo();
  const t = torneo.data;
  const [cobrando, setCobrando] = useState<Equipo | null>(null);
  const [editando, setEditando] = useState<Partido | null>(null);
  const [armando, setArmando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [imprimiendo, setImprimiendo] = useState(false);
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [errorEquipo, setErrorEquipo] = useState('');

  const agregar = useAccion((d: { torneoId: number; nombre: string; telefono: string }) => desenvolver(canchas().torneos.agregarEquipo(d)), [CLAVES.torneos], 'Equipo anotado');
  const quitar = useAccion((eid: number) => desenvolver(canchas().torneos.quitarEquipo(eid)), [CLAVES.torneos], 'Equipo sacado');
  const anular = useAccion((pid: number) => desenvolver(canchas().torneos.anularPagoEquipo(pid)), [CLAVES.torneos], 'Pago anulado');
  const terminar = useAccion((tid: number) => desenvolver(canchas().torneos.terminar(tid)), [CLAVES.torneos], '¡Torneo terminado!');
  const cancelar = useAccion((tid: number) => desenvolver(canchas().torneos.cancelar(tid)), [CLAVES.torneos, CLAVES.bloqueos, CLAVES.reservas], 'Torneo cancelado');

  if (torneo.isError) {
    return (
      <div className="mx-auto max-w-[900px] px-10 pt-9">
        <Vacio titulo="Ese torneo no existe" acciones={<Button onClick={() => navegar('/torneos')}>Volver a Torneos</Button>}>
          Puede que lo hayan cancelado.
        </Vacio>
      </div>
    );
  }
  if (!t) return null;

  const c = COLOR[t.deporte];
  const rondas = [...new Set(t.listaDePartidos.map((p) => p.ronda))];
  const hoy = fechaISO();

  function enviarEquipo(e: FormEvent) {
    e.preventDefault();
    if (!t) return;
    agregar.mutate(
      { torneoId: t.id, nombre, telefono },
      {
        onSuccess: () => {
          setNombre('');
          setTelefono('');
          setErrorEquipo('');
        },
        onError: (err) => setErrorEquipo(err.message),
      },
    );
  }

  return (
    <div className="mx-auto max-w-[1000px] px-10 pt-9 pb-12">
      <Link to="/torneos" className="mb-4 inline-flex items-center gap-1.5 text-[14px] font-semibold text-tinta-suave hover:text-tinta">
        <ArrowLeft className="size-4" aria-hidden="true" /> Torneos
      </Link>
      <header className={cn('flex flex-wrap items-center gap-4 rounded-xl bg-gradient-to-br px-6 py-5 text-white', c.cabecera)}>
        <Trophy className="size-10 shrink-0 text-pelota" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-[32px] leading-none font-extrabold tracking-[-0.02em]">{t.nombre}</h1>
          <p className="mt-1.5 text-white/85">
            {NOMBRE_DEPORTE[t.deporte]} · {rangoCorto(t.fechaDesde, t.fechaHasta)} · Inscripción {t.cuotaCentavos ? pesos(t.cuotaCentavos) : 'gratis'}
            {t.bloqueoId !== null && ' · Canchas cerradas'}
          </p>
          {t.nota && <p className="mt-1 text-[14px] text-white/80">{t.nota}</p>}
        </div>
        <span className="rounded-full bg-white/18 px-3 py-1 text-[13px] font-bold">{NOMBRE_ESTADO_TORNEO[t.estado]}</span>
      </header>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {t.estado === 'inscripcion' && (
            <Button onClick={() => setArmando(true)} disabled={t.equipos < 3}>
              <Swords aria-hidden="true" /> Armar fixture
            </Button>
          )}
          {t.estado === 'inscripcion' && t.equipos < 3 && <span className="self-center text-[13px] text-tinta-suave">Hacen falta 3 equipos como mínimo.</span>}
          {t.estado === 'en_juego' && (
            <Button
              onClick={() => terminar.mutate(t.id, { onError: (e) => toast.error(e.message) })}
              disabled={terminar.isPending}
            >
              <Flag aria-hidden="true" /> Terminar torneo
            </Button>
          )}
          {t.partidos > 0 && (
            <Button variant="outline" onClick={() => setImprimiendo(true)}>
              <Printer aria-hidden="true" /> Imprimir fixture y tabla
            </Button>
          )}
        </div>
        {esAdmin && (
          <Button variant="ghost-destructive" onClick={() => setCancelando(true)}>
            <Trash2 aria-hidden="true" /> Cancelar torneo
          </Button>
        )}
      </div>

      <Tabs defaultValue="equipos" className="mt-4">
        <TabsList>
          <TabsTrigger value="equipos">
            <Users className="size-[18px]" aria-hidden="true" /> Equipos <span className="marcador text-[13px] text-tinta-suave">{t.equipos}</span>
          </TabsTrigger>
          <TabsTrigger value="fixture">
            <CalendarClock className="size-[18px]" aria-hidden="true" /> Fixture{' '}
            {t.partidos > 0 && (
              <span className="marcador text-[13px] text-tinta-suave">
                {t.partidosJugados}/{t.partidos}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="posiciones">
            <ListOrdered className="size-[18px]" aria-hidden="true" /> Posiciones
          </TabsTrigger>
        </TabsList>

        <TabsContent value="equipos" className="pt-5">
          {t.estado === 'inscripcion' && (
            <form onSubmit={enviarEquipo} noValidate className="mb-5 flex flex-wrap items-start gap-3 rounded-xl border border-linea bg-superficie p-4">
              <div className="min-w-[220px] flex-1">
                <label htmlFor="eq-nombre" className="mb-2 block text-sm font-medium">Nombre del equipo</label>
                <Input id="eq-nombre" maxLength={40} placeholder="Los Pibes FC" value={nombre} onChange={(e) => setNombre(e.target.value)} />
              </div>
              <div className="w-[200px]">
                <label htmlFor="eq-tel" className="mb-2 block text-sm font-medium">Teléfono (opcional)</label>
                <Input id="eq-tel" inputMode="tel" maxLength={30} placeholder="370 455-1020" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
              </div>
              <Button type="submit" className="mt-[30px]" disabled={agregar.isPending}>
                <UserPlus aria-hidden="true" /> Anotar
              </Button>
              {errorEquipo && (
                <p role="alert" className="basis-full text-[14px] font-medium text-rojo">{errorEquipo}</p>
              )}
            </form>
          )}
          {t.listaDeEquipos.length === 0 ? (
            <Vacio titulo="Todavía no hay equipos">Anotá los equipos arriba. Con 3 o más ya se puede armar el fixture.</Vacio>
          ) : (
            <ul className="flex flex-col gap-2">
              {t.listaDeEquipos.map((e) => {
                const saldo = t.cuotaCentavos - e.pagadoCentavos;
                return (
                  <li key={e.id} className="rounded-xl border border-linea bg-superficie px-4 py-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{e.nombre}</p>
                        {e.telefono && <p className="text-[13px] text-tinta-suave">{e.telefono}</p>}
                      </div>
                      {t.cuotaCentavos > 0 && (
                        <>
                          <span
                            className={cn(
                              'rounded-full px-2.5 py-0.5 text-[13px] font-bold',
                              e.estadoDePago === 'saldado' ? 'bg-verde-suave text-verde' : e.estadoDePago === 'sena' ? 'bg-pelota/40 text-tinta' : 'bg-rojo-suave text-rojo',
                            )}
                          >
                            {e.estadoDePago === 'saldado' && <Check className="mr-1 inline size-3.5" aria-hidden="true" />}
                            {NOMBRE_PAGO[e.estadoDePago]}
                          </span>
                          <span className="numeros w-24 text-right text-[14px]">{saldo > 0 ? `Falta ${pesos(saldo)}` : pesos(e.pagadoCentavos)}</span>
                          {saldo > 0 && t.estado !== 'terminado' && (
                            <Button variant="outline" size="sm" onClick={() => setCobrando(e)}>
                              <CircleDollarSign aria-hidden="true" /> Cobrar
                            </Button>
                          )}
                        </>
                      )}
                      {t.estado === 'inscripcion' && (
                        <Button variant="ghost-destructive" size="sm" aria-label={`Sacar a ${e.nombre}`} disabled={quitar.isPending} onClick={() => quitar.mutate(e.id, { onError: (err) => toast.error(err.message) })}>
                          Sacar
                        </Button>
                      )}
                    </div>
                    {e.pagos.length > 0 && (
                      <ul className="mt-2 divide-y divide-linea border-t border-linea text-[13px]">
                        {e.pagos.map((p) => (
                          <li key={p.id} className="flex items-center gap-3 py-1.5">
                            <span className="marcador w-24 text-[15px]">{pesos(p.montoCentavos)}</span>
                            <span className="flex-1 text-tinta-suave">
                              {NOMBRE_METODO[p.metodo]} · {p.creadoEn.slice(8, 10)}/{p.creadoEn.slice(5, 7)}
                              {p.usuario ? ` · ${p.usuario}` : ''}
                            </span>
                            {(esAdmin || p.creadoEn.slice(0, 10) === hoy) && (
                              <Button variant="ghost-destructive" size="sm" disabled={anular.isPending} onClick={() => anular.mutate(p.id, { onError: (err) => toast.error(err.message) })}>
                                Anular
                              </Button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="fixture" className="pt-5">
          {t.partidos === 0 ? (
            <Vacio titulo="El fixture todavía no está armado">
              {t.estado === 'inscripcion' ? 'Cuando estén todos los equipos anotados, tocá "Armar fixture".' : 'No hay partidos.'}
            </Vacio>
          ) : (
            <div className="flex flex-col gap-4">
              {rondas.map((r) => (
                <section key={r} aria-label={`Fecha ${r}`} className="rounded-xl border border-linea bg-superficie p-4">
                  <h2 className="mb-2 font-display text-lg font-bold">Fecha {r}</h2>
                  <ul className="divide-y divide-linea">
                    {t.listaDePartidos
                      .filter((p) => p.ronda === r)
                      .map((p) => (
                        <li key={p.id} className="flex items-center gap-3 py-2">
                          <p className="min-w-0 flex-1 truncate text-right font-semibold">{p.local}</p>
                          <span className={cn('marcador w-20 rounded-md py-1 text-center text-[18px]', p.golesLocal !== null ? 'bg-tinta text-white' : 'bg-secondary text-tinta-suave')}>
                            {p.golesLocal !== null ? `${p.golesLocal} - ${p.golesVisitante}` : 'vs'}
                          </span>
                          <p className="min-w-0 flex-1 truncate font-semibold">{p.visitante}</p>
                          <span className="w-[170px] text-right text-[13px] text-tinta-suave">
                            {p.fecha ? `${fechaCorta(p.fecha).slice(0, 5)} · ${p.hora} h${p.cancha ? ` · ${p.cancha}` : ''}` : 'Sin programar'}
                          </span>
                          {t.estado === 'en_juego' && (
                            <Button variant="outline" size="sm" aria-label={`Editar ${p.local} vs ${p.visitante}`} onClick={() => setEditando(p)}>
                              {p.golesLocal !== null ? 'Editar' : 'Cargar'}
                            </Button>
                          )}
                        </li>
                      ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="posiciones" className="pt-5">
          <section className="rounded-xl border border-linea bg-superficie p-5">
            {t.posiciones.length === 0 ? <p className="text-tinta-suave">Cuando se anoten equipos aparece la tabla.</p> : <Tabla t={t} />}
            <p className="mt-3 text-[12px] text-tinta-suave">3 puntos por ganar, 1 por empatar. Desempata la diferencia de gol y después los goles a favor.</p>
          </section>
        </TabsContent>
      </Tabs>

      <DialogoCobroEquipo equipo={cobrando} cuotaCentavos={t.cuotaCentavos} alCerrar={() => setCobrando(null)} />
      <DialogoPartido torneo={t} partido={editando} alCerrar={() => setEditando(null)} />
      <ConfirmarFixture abierto={armando} torneo={t} alCerrar={() => setArmando(false)} />
      <Dialog open={cancelando} onOpenChange={setCancelando}>
        <DialogContent className="max-w-[460px]">
          <DialogHeader>
            <DialogTitle>¿Cancelar el torneo?</DialogTitle>
            <DialogDescription>Se quita de la lista y se abren de nuevo las canchas que había cerrado. Los pagos de inscripción quedan registrados.</DialogDescription>
          </DialogHeader>
          <DialogBody />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelando(false)}>Volver</Button>
            <Button variant="destructive" disabled={cancelar.isPending} onClick={() => cancelar.mutate(t.id, { onSuccess: () => navegar('/torneos'), onError: (e) => toast.error(e.message) })}>
              Cancelar torneo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {imprimiendo && (
        <Imprimible alTerminar={() => setImprimiendo(false)}>
          <FixtureImpreso t={t} complejo={complejo.data?.nombre ?? ''} />
        </Imprimible>
      )}
    </div>
  );
}
