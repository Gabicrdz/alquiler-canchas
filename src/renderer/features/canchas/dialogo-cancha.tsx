// Crear o editar una cancha: deporte, duración del turno, horario y precios por franja.
import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { esquemaCancha, type DatosCancha } from '@compartido/esquemas';
import { DEPORTES, NOMBRE_DEPORTE, NOMBRE_TIPO_DE_DIA, PROPUESTA, TIPOS_DE_DIA, horariosDeCancha, type Deporte, type Tarifa } from '@compartido/canchas';
import type { Cancha } from '@compartido/tipos';
import { Button } from '@/components/ui/button';
import { Campo } from '@/components/ui/campo';
import { CampoPesos } from '@/components/ui/campo-pesos';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { CanchaDibujo } from '@/components/layout/cancha-dibujo';
import { desenvolver, canchas } from '@/lib/api';
import { cn } from '@/lib/utils';
import { CLAVES, useAccion } from '@/features/comun/consultas';
import { COLOR } from '@/features/reservas/estilos';
import { SelectorHora } from './selector-hora';

const DURACIONES = [30, 45, 60, 75, 90, 120];

interface Formulario {
  nombre: string;
  deporte: Deporte;
  detalle: string;
  techada: boolean;
  duracionMin: number;
  apertura: string;
  cierre: string;
  precioBase: number | null;
  tarifas: (Omit<Tarifa, 'precioCentavos'> & { precio: number | null })[];
}

const vacio = (deporte: Deporte = 'futbol'): Formulario => ({ nombre: '', deporte, ...PROPUESTA[deporte], techada: false, precioBase: null, tarifas: [] });

export function DialogoCancha({ abierto, cancha, alCerrar }: { abierto: boolean; cancha: Cancha | null; alCerrar: () => void }) {
  const [f, setF] = useState<Formulario>(vacio());
  const [error, setError] = useState('');
  const guardar = useAccion((d: DatosCancha) => desenvolver(canchas().canchas.guardar(d)), [CLAVES.canchas, CLAVES.reservas], 'Cancha guardada');

  useEffect(() => {
    if (!abierto) return;
    setError('');
    setF(
      cancha
        ? {
            nombre: cancha.nombre,
            deporte: cancha.deporte,
            detalle: cancha.detalle,
            techada: cancha.techada,
            duracionMin: cancha.duracionMin,
            apertura: cancha.apertura,
            cierre: cancha.cierre,
            precioBase: cancha.precioBaseCentavos,
            tarifas: cancha.tarifas.map(({ precioCentavos, ...t }) => ({ ...t, precio: precioCentavos })),
          }
        : vacio(),
    );
  }, [abierto, cancha]);

  const cambiar = (parte: Partial<Formulario>) => {
    setF((antes) => ({ ...antes, ...parte }));
    setError('');
  };

  /** Al cambiar de deporte en una cancha NUEVA, se proponen la duración y el horario típicos. */
  function elegirDeporte(deporte: Deporte) {
    if (cancha) return cambiar({ deporte });
    cambiar({ deporte, ...PROPUESTA[deporte] });
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (f.precioBase === null) return setError('Escribí el precio base.');
    if (f.tarifas.some((t) => t.precio === null)) return setError('Falta el precio en una de las franjas.');
    const datos: DatosCancha = {
      id: cancha?.id,
      nombre: f.nombre,
      deporte: f.deporte,
      detalle: f.detalle,
      techada: f.techada,
      duracionMin: f.duracionMin,
      apertura: f.apertura,
      cierre: f.cierre,
      precioBaseCentavos: f.precioBase,
      tarifas: f.tarifas.map(({ precio, ...t }) => ({ ...t, precioCentavos: precio ?? 0 })),
    };
    const r = esquemaCancha.safeParse(datos);
    if (!r.success) return setError(r.error.issues[0]?.message ?? 'Revisá los datos.');
    setError('');
    guardar.mutate(datos, { onSuccess: alCerrar, onError: (err) => setError(err.message) });
  }

  const turnos = horariosDeCancha(f.apertura, f.cierre, f.duracionMin);
  return (
    <Dialog open={abierto} onOpenChange={(a) => !a && alCerrar()}>
      <DialogContent className="max-w-[760px]">
        <form onSubmit={enviar} noValidate className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>{cancha ? `Editar ${cancha.nombre}` : 'Nueva cancha'}</DialogTitle>
            <DialogDescription>Los turnos arrancan a la hora de apertura y siguen de a la duración elegida.</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-5">
            <div role="radiogroup" aria-label="Deporte" className="grid grid-cols-2 gap-3">
              {DEPORTES.map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={f.deporte === d}
                  onClick={() => elegirDeporte(d)}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-acento/40',
                    f.deporte === d ? COLOR[d].elegido : 'border-linea hover:bg-accent',
                  )}
                >
                  <CanchaDibujo deporte={d} fondo className="h-14 w-10 shrink-0" />
                  <span className="font-display text-[20px] font-bold">{NOMBRE_DEPORTE[d]}</span>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Campo etiqueta="Nombre" htmlFor="c-nombre" ayuda="Ej.: Cancha 1, Pádel 2.">
                <Input id="c-nombre" autoFocus={!cancha} maxLength={30} value={f.nombre} onChange={(e) => cambiar({ nombre: e.target.value })} />
              </Campo>
              <Campo etiqueta="Detalle (opcional)" htmlFor="c-detalle" ayuda="Se ve debajo del nombre.">
                <Input id="c-detalle" maxLength={60} value={f.detalle} onChange={(e) => cambiar({ detalle: e.target.value })} />
              </Campo>
            </div>
            <div className="grid grid-cols-4 items-end gap-4">
              <Campo etiqueta="Duración del turno">
                <Select value={String(f.duracionMin)} onValueChange={(v) => cambiar({ duracionMin: Number(v) })}>
                  <SelectTrigger aria-label="Duración del turno">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DURACIONES.map((m) => (
                      <SelectItem key={m} value={String(m)}>
                        {m} minutos
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Campo>
              <Campo etiqueta="Abre">
                <SelectorHora etiqueta="Hora de apertura" valor={f.apertura} alCambiar={(apertura) => cambiar({ apertura })} />
              </Campo>
              <Campo etiqueta="Cierra">
                <SelectorHora etiqueta="Hora de cierre" fin valor={f.cierre} alCambiar={(cierre) => cambiar({ cierre })} />
              </Campo>
              <label className="flex h-11 cursor-pointer items-center gap-2.5 text-[15px] font-medium">
                <Switch checked={f.techada} onCheckedChange={(techada) => cambiar({ techada })} aria-label="Techada" />
                Techada
              </label>
            </div>
            <p className="-mt-2 text-[13px] text-tinta-suave">
              {turnos.length > 0 ? `Entran ${turnos.length} turnos por día: ${turnos.slice(0, 4).join(', ')}${turnos.length > 4 ? '…' : ''}` : 'Con ese horario no entra ningún turno.'}
            </p>

            <fieldset className="rounded-xl border border-linea p-4">
              <legend className="px-1 text-sm font-semibold">Precio del turno</legend>
              <div className="flex flex-col gap-4">
                <Campo etiqueta="Precio base" htmlFor="c-base" className="max-w-[240px]" ayuda="Vale cuando ninguna franja cubre el horario.">
                  <CampoPesos id="c-base" valor={f.precioBase} alCambiar={(precioBase) => cambiar({ precioBase })} />
                </Campo>
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium">Franjas con otro precio (de noche, fin de semana…)</span>
                  {f.tarifas.length === 0 && <p className="py-2 text-[14px] text-tinta-suave">Sin franjas: todos los turnos salen al precio base.</p>}
                  {f.tarifas.map((t, i) => (
                    <div key={i} className="grid grid-cols-[150px_1fr_1fr_150px_auto] items-center gap-2">
                      <Select value={t.dias} onValueChange={(dias) => cambiar({ tarifas: f.tarifas.map((x, j) => (j === i ? { ...x, dias: dias as Tarifa['dias'] } : x)) })}>
                        <SelectTrigger aria-label="Días de la franja">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TIPOS_DE_DIA.map((d) => (
                            <SelectItem key={d} value={d}>
                              {NOMBRE_TIPO_DE_DIA[d]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <SelectorHora etiqueta="Desde" valor={t.desde} alCambiar={(desde) => cambiar({ tarifas: f.tarifas.map((x, j) => (j === i ? { ...x, desde } : x)) })} />
                      <SelectorHora etiqueta="Hasta" fin valor={t.hasta} alCambiar={(hasta) => cambiar({ tarifas: f.tarifas.map((x, j) => (j === i ? { ...x, hasta } : x)) })} />
                      <CampoPesos aria-label="Precio de la franja" valor={t.precio} alCambiar={(precio) => cambiar({ tarifas: f.tarifas.map((x, j) => (j === i ? { ...x, precio } : x)) })} />
                      <Button variant="ghost-destructive" size="icon-sm" aria-label="Quitar franja" onClick={() => cambiar({ tarifas: f.tarifas.filter((_, j) => j !== i) })}>
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className="self-start"
                    onClick={() => cambiar({ tarifas: [...f.tarifas, { dias: 'todos', desde: f.cierre > '19:00' ? '19:00' : f.apertura, hasta: f.cierre, precio: f.precioBase }] })}
                  >
                    <Plus aria-hidden="true" /> Agregar franja
                  </Button>
                </div>
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
                {cancha ? 'Guardar' : 'Crear cancha'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
