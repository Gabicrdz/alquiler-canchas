// Bloquear una cancha (o todas) por lluvia, mantenimiento, un torneo… Mientras
// dura, no se pueden tomar reservas en ese horario. Si ya hay reservas, avisa
// cuántas son y pregunta si se cancelan (y qué pasa con la seña).
import { useEffect, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Ban, CloudRain, Trophy, Wrench, type LucideIcon } from 'lucide-react';
import { esquemaBloqueo } from '@compartido/esquemas';
import { MOTIVOS_BLOQUEO, NOMBRE_MOTIVO, type MotivoBloqueo } from '@compartido/canchas';
import { Button } from '@/components/ui/button';
import { Campo } from '@/components/ui/campo';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SelectorHora } from '@/features/canchas/selector-hora';
import { CLAVES, useAccion, useCanchas } from '@/features/comun/consultas';
import { desenvolver, canchas } from '@/lib/api';
import { fechaISO } from '@/lib/fechas';
import { cn } from '@/lib/utils';

const ICONO: Record<MotivoBloqueo, LucideIcon> = { lluvia: CloudRain, mantenimiento: Wrench, torneo: Trophy, otro: Ban };

export function DialogoBloqueo({ abierto, fechaInicial, alCerrar }: { abierto: boolean; fechaInicial: string; alCerrar: () => void }) {
  const lista = useCanchas();
  const activas = (lista.data ?? []).filter((c) => c.activo);
  const [cancha, setCancha] = useState('todas');
  const [motivo, setMotivo] = useState<MotivoBloqueo>('lluvia');
  const [desdeFecha, setDesdeFecha] = useState(fechaInicial);
  const [hastaFecha, setHastaFecha] = useState(fechaInicial);
  const [todoElDia, setTodoElDia] = useState(true);
  const [desde, setDesde] = useState('15:00');
  const [hasta, setHasta] = useState('19:00');
  const [nota, setNota] = useState('');
  const [cancelar, setCancelar] = useState(false);
  const [devolver, setDevolver] = useState(true);
  const [error, setError] = useState('');

  // Cada vez que se abre, vuelve a empezar con el día que se estaba mirando
  useEffect(() => {
    if (!abierto) return;
    setCancha('todas');
    setMotivo('lluvia');
    setDesdeFecha(fechaInicial);
    setHastaFecha(fechaInicial);
    setTodoElDia(true);
    setNota('');
    setCancelar(false);
    setDevolver(true);
    setError('');
    // solo al abrir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  const datos = {
    canchaId: cancha === 'todas' ? null : Number(cancha),
    fechaDesde: desdeFecha,
    fechaHasta: hastaFecha,
    desde: todoElDia ? null : desde,
    hasta: todoElDia ? null : hasta,
    motivo,
    nota,
    cancelarReservas: cancelar,
    devolverSena: devolver,
  };
  const valido = esquemaBloqueo.safeParse(datos);
  // Cuántas reservas se cancelarían (se consulta mientras se completa el formulario)
  const afectadas = useQuery({
    queryKey: [...CLAVES.bloqueos, 'afectadas', { ...datos, cancelarReservas: false, devolverSena: true }],
    queryFn: () => desenvolver(canchas().bloqueos.afectadas({ ...datos, cancelarReservas: false, devolverSena: true })),
    enabled: abierto && valido.success,
    staleTime: 0,
  });
  const cuantas = afectadas.data ?? 0;

  const guardar = useAccion((d: typeof datos) => desenvolver(canchas().bloqueos.crear(d)), [CLAVES.reservas, CLAVES.bloqueos, CLAVES.abonos], (r) =>
    r.canceladas ? `Bloqueado. Se ${r.canceladas === 1 ? 'canceló 1 reserva' : `cancelaron ${r.canceladas} reservas`}.` : 'Listo: ese horario quedó bloqueado',
  );

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (!valido.success) return setError(valido.error.issues[0]?.message ?? 'Revisá los datos.');
    if (cuantas > 0 && !cancelar) return setError('Marcá que se cancelen las reservas, o cambiá el horario.');
    setError('');
    guardar.mutate(datos, { onSuccess: alCerrar, onError: (err) => setError(err.message) });
  }

  return (
    <Dialog open={abierto} onOpenChange={(a) => !a && alCerrar()}>
      <DialogContent className="max-w-[620px] [&>button[aria-label=Cerrar]]:text-white [&>button[aria-label=Cerrar]]:hover:bg-white/15 [&>button[aria-label=Cerrar]]:hover:text-white">
        <form onSubmit={enviar} noValidate className="flex min-h-0 flex-1 flex-col">
          <DialogHeader className="pb-1">
            <div className="fondo-lateral -mt-6 -mr-16 mb-3 -ml-6 flex items-center gap-4 rounded-t-xl px-6 py-4 pr-16 text-white">
              <CloudRain className="size-9 shrink-0 text-pelota" aria-hidden="true" />
              <div>
                <DialogTitle className="text-white">Bloquear canchas</DialogTitle>
                <DialogDescription className="text-white/85">Mientras dure, no se pueden tomar reservas en ese horario.</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-5">
            <div role="radiogroup" aria-label="Motivo" className="flex flex-wrap gap-2">
              {MOTIVOS_BLOQUEO.map((m) => {
                const Icono = ICONO[m];
                return (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={motivo === m}
                    onClick={() => setMotivo(m)}
                    className={cn(
                      'flex h-11 items-center gap-2 rounded-full border px-4 text-[14px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-acento/50',
                      motivo === m ? 'border-acento bg-acento text-white' : 'border-linea-fuerte bg-superficie hover:bg-accent',
                    )}
                  >
                    <Icono className="size-[18px]" aria-hidden="true" />
                    {NOMBRE_MOTIVO[m]}
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Campo etiqueta="¿Qué cancha?">
                <Select value={cancha} onValueChange={setCancha}>
                  <SelectTrigger aria-label="Cancha">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas las canchas</SelectItem>
                    {activas.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Campo>
              <Campo etiqueta="Nota (opcional)" htmlFor="b-nota" ayuda="Ej.: pintura de líneas.">
                <Input id="b-nota" maxLength={120} value={nota} onChange={(e) => setNota(e.target.value)} />
              </Campo>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Campo etiqueta="Desde el día" htmlFor="b-desde">
                <Input
                  id="b-desde"
                  type="date"
                  min={fechaISO()}
                  value={desdeFecha}
                  onChange={(e) => {
                    setDesdeFecha(e.target.value);
                    if (hastaFecha < e.target.value) setHastaFecha(e.target.value);
                  }}
                />
              </Campo>
              <Campo etiqueta="Hasta el día" htmlFor="b-hasta">
                <Input id="b-hasta" type="date" min={desdeFecha} value={hastaFecha} onChange={(e) => setHastaFecha(e.target.value)} />
              </Campo>
            </div>
            <fieldset className="rounded-lg border border-linea p-4">
              <legend className="px-1 text-sm font-semibold">Horario</legend>
              <label className="flex cursor-pointer items-center gap-2.5 text-[15px] font-medium">
                <input type="checkbox" className="size-[18px] accent-[var(--acento)]" checked={todoElDia} onChange={(e) => setTodoElDia(e.target.checked)} />
                Todo el día
              </label>
              {!todoElDia && (
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <Campo etiqueta="Desde las">
                    <SelectorHora etiqueta="Desde las" valor={desde} alCambiar={setDesde} />
                  </Campo>
                  <Campo etiqueta="Hasta las">
                    <SelectorHora etiqueta="Hasta las" fin valor={hasta} alCambiar={setHasta} />
                  </Campo>
                </div>
              )}
            </fieldset>
            {cuantas > 0 && (
              <section aria-label="Reservas afectadas" className="rounded-xl border border-rojo/30 bg-rojo-suave p-4">
                <p className="font-semibold text-rojo">
                  Hay {cuantas} {cuantas === 1 ? 'reserva' : 'reservas'} en ese horario.
                </p>
                <label className="mt-2 flex cursor-pointer items-center gap-2.5 text-[15px] font-medium">
                  <input type="checkbox" className="size-[18px] accent-[var(--rojo)]" checked={cancelar}
                    onChange={(e) => {
                      setCancelar(e.target.checked);
                      setError('');
                    }} />
                  Cancelarlas para poder bloquear
                </label>
                {cancelar && (
                  <label className="mt-2 flex cursor-pointer items-center gap-2.5 text-[14px]">
                    <input type="checkbox" className="size-[18px] accent-[var(--acento)]" checked={devolver} onChange={(e) => setDevolver(e.target.checked)} />
                    Devolver lo que ya pagaron (si no, queda cobrado)
                  </label>
                )}
              </section>
            )}
          </DialogBody>
          <DialogFooter className="sm:justify-between">
            <p role="alert" className="text-[14px] font-medium text-rojo">
              {error}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={alCerrar}>
                Cancelar
              </Button>
              <Button type="submit" disabled={guardar.isPending}>
                {cuantas > 0 && cancelar ? `Bloquear y cancelar ${cuantas}` : 'Bloquear'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
