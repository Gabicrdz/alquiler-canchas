// Mover una reserva pendiente a otra cancha, otro día u otro horario. Se ven los
// turnos de ese día y solo se pueden elegir los libres. Conserva el precio y lo cobrado.
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { MoveRight } from 'lucide-react';
import { aMinutos } from '@compartido/horarios';
import { bloqueoCubre, horariosDeCancha, NOMBRE_MOTIVO, sumarMinutos } from '@compartido/canchas';
import { pesos } from '@compartido/dinero';
import type { Cancha, Reserva } from '@compartido/tipos';
import { Button } from '@/components/ui/button';
import { Campo } from '@/components/ui/campo';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CLAVES, useAccion, useBloqueos, useReservas } from '@/features/comun/consultas';
import { desenvolver, canchas as api } from '@/lib/api';
import { useAhora } from '@/lib/ahora';
import { fechaLarga } from '@/lib/fechas';
import { cn } from '@/lib/utils';

export function DialogoMover({ reserva, canchas, hoy, alCerrar, alMover }: { reserva: Reserva | null; canchas: Cancha[]; hoy: string; alCerrar: () => void; alMover: () => void }) {
  const ahora = useAhora();
  const [canchaId, setCanchaId] = useState(0);
  const [fecha, setFecha] = useState(hoy);
  const [desde, setDesde] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!reserva) return;
    setCanchaId(reserva.canchaId);
    setFecha(reserva.fecha);
    setDesde(null);
    setError('');
  }, [reserva?.id]);

  const origen = canchas.find((c) => c.id === reserva?.canchaId);
  // Solo canchas con la misma duración de turno (60 con 60, 90 con 90)
  const opciones = canchas.filter((c) => c.duracionMin === origen?.duracionMin);
  const cancha = opciones.find((c) => c.id === canchaId);
  const delDia = useReservas({ desde: fecha || hoy, hasta: fecha || hoy });
  const cierres = useBloqueos({ desde: fecha || hoy, hasta: fecha || hoy });
  const mover = useAccion((d: { id: number; canchaId: number; fecha: string; desde: string }) => desenvolver(api().reservas.mover(d)), [CLAVES.reservas, CLAVES.abonos], 'Reserva movida');

  const minutoAhora = ahora.getHours() * 60 + ahora.getMinutes();
  const turnos = cancha
    ? horariosDeCancha(cancha.apertura, cancha.cierre, cancha.duracionMin).map((d) => {
        const hasta = sumarMinutos(d, cancha.duracionMin);
        const ocupado = (delDia.data ?? []).find((r) => r.canchaId === cancha.id && r.id !== reserva?.id && r.desde < hasta && d < r.hasta);
        const cierre = (cierres.data ?? []).find((b) => bloqueoCubre(b, cancha.id, fecha, d, hasta));
        const pasado = fecha < hoy || (fecha === hoy && aMinutos(hasta) <= minutoAhora);
        const actual = reserva?.id !== undefined && delDia.data?.some((r) => r.id === reserva.id && r.canchaId === cancha.id && r.desde === d);
        const nota = actual ? 'Es este' : pasado ? 'Ya pasó' : cierre ? NOMBRE_MOTIVO[cierre.motivo] : ocupado ? 'Ocupado' : null;
        return { desde: d, hasta, nota };
      })
    : [];

  function confirmar() {
    if (!reserva || !cancha || !desde) return;
    setError('');
    mover.mutate({ id: reserva.id, canchaId: cancha.id, fecha, desde }, { onSuccess: alMover, onError: (e) => (setError(e.message), toast.error(e.message)) });
  }

  return (
    <Dialog open={reserva !== null} onOpenChange={(a) => !a && alCerrar()}>
      <DialogContent className="max-w-[600px]">
        {reserva && (
          <>
            <DialogHeader>
              <DialogTitle>Mover la reserva de {reserva.cliente}</DialogTitle>
              <DialogDescription>
                Ahora: {origen?.nombre} · {reserva.desde} del {fechaLarga(reserva.fecha)}. Conserva el precio ({pesos(reserva.precioCentavos)}){reserva.pagadoCentavos > 0 ? ` y lo cobrado (${pesos(reserva.pagadoCentavos)})` : ''}.
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="flex flex-col gap-5">
              <div className="grid grid-cols-2 gap-4">
                <Campo etiqueta="Cancha">
                  <Select
                    value={String(canchaId)}
                    onValueChange={(v) => {
                      setCanchaId(Number(v));
                      setDesde(null);
                    }}
                  >
                    <SelectTrigger aria-label="Cancha de destino">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {opciones.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Campo>
                <Campo etiqueta="Día" htmlFor="m-fecha">
                  <Input
                    id="m-fecha"
                    type="date"
                    min={hoy}
                    value={fecha}
                    onChange={(e) => {
                      setFecha(e.target.value);
                      setDesde(null);
                    }}
                  />
                </Campo>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">Elegí el horario</p>
                <div role="radiogroup" aria-label="Horario" className="grid grid-cols-3 gap-2">
                  {turnos.map((t) => (
                    <button
                      key={t.desde}
                      type="button"
                      role="radio"
                      aria-checked={desde === t.desde}
                      disabled={t.nota !== null}
                      onClick={() => setDesde(t.desde)}
                      className={cn(
                        'flex h-14 flex-col items-center justify-center rounded-lg border text-[14px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-acento/50',
                        desde === t.desde ? 'border-acento bg-acento text-white' : 'border-linea-fuerte bg-superficie hover:bg-accent',
                        t.nota !== null && 'cursor-not-allowed bg-secondary/60 text-tinta-suave opacity-70 hover:bg-secondary/60',
                      )}
                    >
                      <span className="marcador text-[15px]">
                        {t.desde} – {t.hasta}
                      </span>
                      {t.nota && <span className="text-[11px] font-medium">{t.nota}</span>}
                    </button>
                  ))}
                </div>
              </div>
            </DialogBody>
            <DialogFooter className="sm:justify-between">
              <p role="alert" className="text-[14px] font-medium text-rojo">
                {error}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={alCerrar}>
                  Cancelar
                </Button>
                <Button disabled={!desde || mover.isPending} onClick={confirmar}>
                  <MoveRight aria-hidden="true" /> {desde && cancha ? `Mover a ${cancha.nombre} · ${desde}` : 'Mover'}
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
