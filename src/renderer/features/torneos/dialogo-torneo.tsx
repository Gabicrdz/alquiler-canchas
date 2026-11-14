// Crear un torneo: nombre, deporte, fechas, cuota por equipo y (si se quiere)
// cerrar las canchas mientras se juega (usa el mismo bloqueo de la etapa 2).
import { useEffect, useState, type FormEvent } from 'react';
import { Trophy } from 'lucide-react';
import { DEPORTES, NOMBRE_DEPORTE, type Deporte } from '@compartido/canchas';
import { esquemaTorneo, type DatosTorneo } from '@compartido/esquemas';
import { Button } from '@/components/ui/button';
import { Campo } from '@/components/ui/campo';
import { CampoPesos } from '@/components/ui/campo-pesos';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CLAVES, useAccion, useCanchas } from '@/features/comun/consultas';
import { desenvolver, canchas } from '@/lib/api';
import { fechaISO } from '@/lib/fechas';
import { cn } from '@/lib/utils';

export function DialogoTorneo({ abierto, alCerrar, alCrear }: { abierto: boolean; alCerrar: () => void; alCrear: (id: number) => void }) {
  const lista = useCanchas();
  const [nombre, setNombre] = useState('');
  const [deporte, setDeporte] = useState<Deporte>('futbol');
  const [desde, setDesde] = useState(fechaISO());
  const [hasta, setHasta] = useState(fechaISO());
  const [cuota, setCuota] = useState<number | null>(0);
  const [nota, setNota] = useState('');
  const [bloquear, setBloquear] = useState(false);
  const [cancha, setCancha] = useState('todas');
  const [cancelar, setCancelar] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!abierto) return;
    setNombre('');
    setDeporte('futbol');
    setDesde(fechaISO());
    setHasta(fechaISO());
    setCuota(0);
    setNota('');
    setBloquear(false);
    setCancha('todas');
    setCancelar(false);
    setError('');
  }, [abierto]);

  const guardar = useAccion((d: DatosTorneo) => desenvolver(canchas().torneos.crear(d)), [CLAVES.torneos, CLAVES.bloqueos, CLAVES.reservas], 'Torneo creado');

  function enviar(e: FormEvent) {
    e.preventDefault();
    const datos = {
      nombre,
      deporte,
      fechaDesde: desde,
      fechaHasta: hasta,
      cuotaCentavos: cuota ?? 0,
      nota,
      bloquear,
      bloqueoCanchaId: cancha === 'todas' ? null : Number(cancha),
      cancelarReservas: cancelar,
      devolverSena: true,
    };
    const v = esquemaTorneo.safeParse(datos);
    if (!v.success) return setError(v.error.issues[0]?.message ?? 'Revisá los datos.');
    setError('');
    guardar.mutate(datos, { onSuccess: (id) => {
        alCrear(id);
        alCerrar();
      }, onError: (err) => setError(err.message) });
  }

  return (
    <Dialog open={abierto} onOpenChange={(a) => !a && alCerrar()}>
      <DialogContent className="max-w-[620px] [&>button[aria-label=Cerrar]]:text-white [&>button[aria-label=Cerrar]]:hover:bg-white/15 [&>button[aria-label=Cerrar]]:hover:text-white">
        <form onSubmit={enviar} noValidate className="flex min-h-0 flex-1 flex-col">
          <DialogHeader className="pb-1">
            <div className="fondo-lateral -mt-6 -mr-16 mb-3 -ml-6 flex items-center gap-4 rounded-t-xl px-6 py-4 pr-16 text-white">
              <Trophy className="size-9 shrink-0 text-pelota" aria-hidden="true" />
              <div>
                <DialogTitle className="text-white">Nuevo torneo</DialogTitle>
                <DialogDescription className="text-white/85">Después anotás los equipos y armás el fixture.</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-5">
            <div className="grid grid-cols-[1fr_auto] gap-4">
              <Campo etiqueta="Nombre del torneo" htmlFor="t-nombre">
                <Input id="t-nombre" autoFocus maxLength={60} placeholder="Copa Verano" value={nombre} onChange={(e) => setNombre(e.target.value)} />
              </Campo>
              <div role="radiogroup" aria-label="Deporte" className="flex items-end gap-2">
                {DEPORTES.map((d) => (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={deporte === d}
                    onClick={() => setDeporte(d)}
                    className={cn(
                      'h-11 rounded-full border px-4 text-[14px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-acento/50',
                      deporte === d ? (d === 'futbol' ? 'border-fut bg-fut text-white' : 'border-pad bg-pad text-white') : 'border-linea-fuerte bg-superficie hover:bg-accent',
                    )}
                  >
                    {NOMBRE_DEPORTE[d]}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Campo etiqueta="Desde el día" htmlFor="t-desde">
                <Input
                  id="t-desde"
                  type="date"
                  value={desde}
                  onChange={(e) => {
                    setDesde(e.target.value);
                    if (hasta < e.target.value) setHasta(e.target.value);
                  }}
                />
              </Campo>
              <Campo etiqueta="Hasta el día" htmlFor="t-hasta">
                <Input id="t-hasta" type="date" min={desde} value={hasta} onChange={(e) => setHasta(e.target.value)} />
              </Campo>
              <Campo etiqueta="Inscripción por equipo" htmlFor="t-cuota" ayuda="$ 0 = gratis">
                <CampoPesos id="t-cuota" valor={cuota} alCambiar={setCuota} />
              </Campo>
            </div>
            <Campo etiqueta="Nota (opcional)" htmlFor="t-nota">
              <Input id="t-nota" maxLength={200} placeholder="Premios, reglas, categoría…" value={nota} onChange={(e) => setNota(e.target.value)} />
            </Campo>
            <fieldset className="rounded-lg border border-linea p-4">
              <legend className="px-1 text-sm font-semibold">Canchas</legend>
              <label className="flex cursor-pointer items-center gap-2.5 text-[15px] font-medium">
                <input type="checkbox" className="size-[18px] accent-[var(--acento)]" checked={bloquear} onChange={(e) => setBloquear(e.target.checked)} />
                Cerrar las canchas mientras dura el torneo
              </label>
              {bloquear && (
                <div className="mt-4 flex flex-col gap-3">
                  <Campo etiqueta="¿Qué cancha?">
                    <Select value={cancha} onValueChange={setCancha}>
                      <SelectTrigger aria-label="Cancha a cerrar">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todas">Todas las canchas</SelectItem>
                        {(lista.data ?? [])
                          .filter((c) => c.activo)
                          .map((c) => (
                            <SelectItem key={c.id} value={String(c.id)}>
                              {c.nombre}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </Campo>
                  <label className="flex cursor-pointer items-center gap-2.5 text-[14px]">
                    <input type="checkbox" className="size-[18px] accent-[var(--rojo)]" checked={cancelar} onChange={(e) => setCancelar(e.target.checked)} />
                    Si ya hay reservas esos días, cancelarlas (se les devuelve lo pagado)
                  </label>
                </div>
              )}
            </fieldset>
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
                Crear torneo
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
