// Un partido del fixture: cuándo y dónde se juega, y el resultado.
import { useEffect, useState, type FormEvent } from 'react';
import type { DetalleTorneo, Partido } from '@compartido/tipos';
import { Button } from '@/components/ui/button';
import { Campo } from '@/components/ui/campo';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SelectorHora } from '@/features/canchas/selector-hora';
import { CLAVES, useAccion, useCanchas } from '@/features/comun/consultas';
import { desenvolver, canchas } from '@/lib/api';

const golesTexto = (n: number | null) => (n === null ? '' : String(n));
const aGoles = (t: string) => (t.trim() === '' ? null : Number(t));

export function DialogoPartido({ torneo, partido, alCerrar }: { torneo: DetalleTorneo; partido: Partido | null; alCerrar: () => void }) {
  const lista = useCanchas();
  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('18:00');
  const [cancha, setCancha] = useState('ninguna');
  const [gl, setGl] = useState('');
  const [gv, setGv] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!partido) return;
    setFecha(partido.fecha ?? '');
    setHora(partido.hora ?? '18:00');
    setCancha(partido.canchaId ? String(partido.canchaId) : 'ninguna');
    setGl(golesTexto(partido.golesLocal));
    setGv(golesTexto(partido.golesVisitante));
    setError('');
  }, [partido?.id]);

  const guardar = useAccion(
    async (p: { partidoId: number; programar: { fecha: string | null; hora: string | null; canchaId: number | null }; golesLocal: number | null; golesVisitante: number | null }) => {
      await desenvolver(canchas().torneos.programarPartido({ partidoId: p.partidoId, ...p.programar }));
      await desenvolver(canchas().torneos.cargarResultado({ partidoId: p.partidoId, golesLocal: p.golesLocal, golesVisitante: p.golesVisitante }));
    },
    [CLAVES.torneos],
    'Partido guardado',
  );

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (!partido) return;
    const golesLocal = aGoles(gl);
    const golesVisitante = aGoles(gv);
    if ((golesLocal === null) !== (golesVisitante === null)) return setError('Cargá los goles de los dos equipos (o dejá los dos vacíos).');
    if ([golesLocal, golesVisitante].some((g) => g !== null && (!Number.isInteger(g) || g < 0 || g > 99))) return setError('Los goles son números de 0 a 99.');
    setError('');
    guardar.mutate(
      { partidoId: partido.id, programar: { fecha: fecha || null, hora: fecha ? hora : null, canchaId: cancha === 'ninguna' ? null : Number(cancha) }, golesLocal, golesVisitante },
      { onSuccess: alCerrar, onError: (err) => setError(err.message) },
    );
  }

  const canchasDelDeporte = (lista.data ?? []).filter((c) => c.activo && c.deporte === torneo.deporte);

  return (
    <Dialog open={partido !== null} onOpenChange={(a) => !a && alCerrar()}>
      <DialogContent className="max-w-[540px]">
        {partido && (
          <form onSubmit={enviar} noValidate className="flex min-h-0 flex-1 flex-col">
            <DialogHeader>
              <DialogTitle>
                {partido.local} vs {partido.visitante}
              </DialogTitle>
              <DialogDescription>Fecha {partido.ronda} del fixture.</DialogDescription>
            </DialogHeader>
            <DialogBody className="flex flex-col gap-5">
              <fieldset className="rounded-lg border border-linea p-4">
                <legend className="px-1 text-sm font-semibold">Resultado</legend>
                <div className="grid grid-cols-[1fr_88px_88px_1fr] items-center gap-3">
                  <p className="truncate text-right font-semibold">{partido.local}</p>
                  <Input aria-label={`Goles de ${partido.local}`} inputMode="numeric" className="numeros text-center text-lg font-bold" value={gl} onChange={(e) => setGl(e.target.value)} />
                  <Input aria-label={`Goles de ${partido.visitante}`} inputMode="numeric" className="numeros text-center text-lg font-bold" value={gv} onChange={(e) => setGv(e.target.value)} />
                  <p className="truncate font-semibold">{partido.visitante}</p>
                </div>
                <p className="mt-2 text-[13px] text-tinta-suave">Dejalos vacíos si todavía no se jugó.</p>
              </fieldset>
              <fieldset className="rounded-lg border border-linea p-4">
                <legend className="px-1 text-sm font-semibold">Cuándo y dónde</legend>
                <div className="grid grid-cols-3 gap-4">
                  <Campo etiqueta="Día" htmlFor="p-fecha">
                    <Input id="p-fecha" type="date" min={torneo.fechaDesde} max={torneo.fechaHasta} value={fecha} onChange={(e) => setFecha(e.target.value)} />
                  </Campo>
                  <Campo etiqueta="Hora">{fecha ? <SelectorHora etiqueta="Hora" valor={hora} alCambiar={setHora} /> : <p className="pt-3 text-[14px] text-tinta-suave">Elegí el día</p>}</Campo>
                  <Campo etiqueta="Cancha">
                    <Select value={cancha} onValueChange={setCancha}>
                      <SelectTrigger aria-label="Cancha del partido">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ninguna">Sin asignar</SelectItem>
                        {canchasDelDeporte.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Campo>
                </div>
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
                  Guardar
                </Button>
              </div>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
