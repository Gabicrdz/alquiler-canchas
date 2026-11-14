// Nueva reserva: se llega tocando un turno libre de la grilla. Cliente, precio
// (se propone el de la franja horaria) y seña opcional.
import { useEffect, useState, type FormEvent } from 'react';
import { esquemaReserva, METODOS, NOMBRE_METODO, type DatosReserva } from '@compartido/esquemas';
import { precioDelTurno, senaSugerida, sumarMinutos } from '@compartido/canchas';
import { pesos } from '@compartido/dinero';
import type { Cancha } from '@compartido/tipos';
import { Button } from '@/components/ui/button';
import { Campo } from '@/components/ui/campo';
import { CampoPesos } from '@/components/ui/campo-pesos';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { CanchaDibujo } from '@/components/layout/cancha-dibujo';
import { desenvolver, canchas } from '@/lib/api';
import { fechaLarga } from '@/lib/fechas';
import { cn } from '@/lib/utils';
import { CLAVES, useAccion, useComplejo } from '@/features/comun/consultas';
import { COLOR } from './estilos';
import { SelectorCliente, type ClienteElegido } from './selector-cliente';

export function DialogoReserva({ turno, fecha, alCerrar }: { turno: { cancha: Cancha; desde: string } | null; fecha: string; alCerrar: () => void }) {
  const complejo = useComplejo();
  const [cliente, setCliente] = useState<ClienteElegido | null>(null);
  const [precio, setPrecio] = useState<number | null>(0);
  const [conSena, setConSena] = useState(true);
  const [sena, setSena] = useState<number | null>(0);
  const [metodo, setMetodo] = useState<(typeof METODOS)[number]>('efectivo');
  const [nota, setNota] = useState('');
  const [error, setError] = useState('');

  const cancha = turno?.cancha;
  const desde = turno?.desde ?? '';
  const porcentaje = complejo.data?.senaPorcentaje ?? 30;

  // Al abrir con otro turno, todo vuelve a empezar con el precio de esa franja
  useEffect(() => {
    if (!cancha) return;
    const p = precioDelTurno(cancha, fecha, desde);
    setCliente(null);
    setPrecio(p);
    setConSena(porcentaje > 0);
    setSena(senaSugerida(p, porcentaje));
    setMetodo('efectivo');
    setNota('');
    setError('');
    // solo cuando se abre un turno distinto
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancha?.id, desde, fecha]);

  const guardar = useAccion(
    (datos: DatosReserva) => desenvolver(canchas().reservas.crear(datos)),
    [CLAVES.reservas, CLAVES.clientes],
    'Reserva guardada',
  );

  function cambiarPrecio(p: number | null) {
    setPrecio(p);
    // La seña acompaña al precio mientras no la hayan tocado a mano
    if (p !== null) setSena(senaSugerida(p, porcentaje));
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (!cancha) return;
    if (!cliente) return setError('Elegí el cliente.');
    if (precio === null) return setError('Escribí el precio.');
    const datos = {
      canchaId: cancha.id,
      clienteId: cliente.id,
      fecha,
      desde,
      precioCentavos: precio,
      nota,
      senaCentavos: conSena ? (sena ?? 0) : 0,
      metodoSena: conSena && (sena ?? 0) > 0 ? metodo : null,
    };
    const r = esquemaReserva.safeParse(datos);
    if (!r.success) return setError(r.error.issues[0]?.message ?? 'Revisá los datos.');
    setError('');
    guardar.mutate(datos, { onSuccess: alCerrar, onError: (err) => setError(err.message) });
  }

  const color = cancha ? COLOR[cancha.deporte] : null;
  const precioFranja = cancha ? precioDelTurno(cancha, fecha, desde) : 0;
  return (
    <Dialog open={turno !== null} onOpenChange={(a) => !a && alCerrar()}>
      <DialogContent className="max-w-[600px]">
        {cancha && color && (
          <form onSubmit={enviar} noValidate className="flex min-h-0 flex-1 flex-col">
            <DialogHeader className="pb-1">
              <div className={cn('-mx-6 -mt-6 mb-3 flex items-center gap-4 rounded-t-xl bg-gradient-to-br px-6 py-4 pr-16 text-white', color.cabecera)}>
                <CanchaDibujo deporte={cancha.deporte} className="h-16 w-11 shrink-0 rounded-md bg-white/15 p-1" />
                <div>
                  <DialogTitle className="text-white">Nueva reserva</DialogTitle>
                  <DialogDescription className="text-white/85 first-letter:uppercase">
                    {cancha.nombre} · {fechaLarga(fecha)} · {desde} a {sumarMinutos(desde, cancha.duracionMin)}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <DialogBody className="flex flex-col gap-5">
              <Campo etiqueta="¿Quién reserva?">
                <SelectorCliente valor={cliente} alElegir={setCliente} />
              </Campo>
              <div className="grid grid-cols-2 gap-4">
                <Campo etiqueta="Precio del turno" htmlFor="r-precio" ayuda={precio !== precioFranja ? `La franja horaria sale ${pesos(precioFranja)}.` : 'Es el precio de esta franja horaria.'}>
                  <CampoPesos id="r-precio" valor={precio} alCambiar={cambiarPrecio} />
                </Campo>
                <Campo etiqueta="Nota (opcional)" htmlFor="r-nota" ayuda="Ej.: cumpleaños, pide pelota.">
                  <Input id="r-nota" maxLength={120} value={nota} onChange={(e) => setNota(e.target.value)} />
                </Campo>
              </div>
              <fieldset className="rounded-lg border border-linea p-4">
                <legend className="px-1 text-sm font-semibold">Seña</legend>
                <label className="flex cursor-pointer items-center gap-2.5 text-[15px] font-medium">
                  <input type="checkbox" className="size-[18px] accent-[var(--acento)]" checked={conSena} onChange={(e) => setConSena(e.target.checked)} />
                  Cobrar una seña ahora
                  {porcentaje > 0 && <span className="text-[13px] font-normal text-tinta-suave">(se propone el {porcentaje} %)</span>}
                </label>
                {conSena && (
                  <div className="mt-4 grid grid-cols-[170px_1fr] items-start gap-4">
                    <Campo etiqueta="Importe" htmlFor="r-sena">
                      <CampoPesos id="r-sena" valor={sena} alCambiar={setSena} />
                    </Campo>
                    <div role="radiogroup" aria-label="Cómo paga la seña" className="flex flex-col gap-2">
                      <span className="text-sm font-medium">Cómo paga</span>
                      <div className="flex flex-wrap gap-2">
                        {METODOS.map((m) => (
                          <button
                            key={m}
                            type="button"
                            role="radio"
                            aria-checked={metodo === m}
                            onClick={() => setMetodo(m)}
                            className={cn(
                              'h-10 rounded-full border px-3.5 text-[14px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-acento/50',
                              metodo === m ? 'border-acento bg-acento text-white' : 'border-linea-fuerte bg-superficie hover:bg-accent',
                            )}
                          >
                            {NOMBRE_METODO[m]}
                          </button>
                        ))}
                      </div>
                    </div>
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
                  {conSena && (sena ?? 0) > 0 ? `Reservar y cobrar ${pesos(sena ?? 0)}` : 'Reservar'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
