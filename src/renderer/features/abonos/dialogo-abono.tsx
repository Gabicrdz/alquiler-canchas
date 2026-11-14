// Nuevo abono: un turno fijo todas las semanas (misma cancha, día y hora) para
// un cliente o equipo. El programa carga los turnos de las próximas 8 semanas.
import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Repeat } from 'lucide-react';
import { esquemaAbono } from '@compartido/esquemas';
import { fechasDeUnDia, NOMBRE_DIA, sumarDias } from '@compartido/horarios';
import { horariosDeCancha, precioDelTurno, sumarMinutos } from '@compartido/canchas';
import { pesos } from '@compartido/dinero';
import { Button } from '@/components/ui/button';
import { Campo } from '@/components/ui/campo';
import { CampoPesos } from '@/components/ui/campo-pesos';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SelectorCliente, type ClienteElegido } from '@/features/reservas/selector-cliente';
import { CLAVES, useAccion, useCanchas } from '@/features/comun/consultas';
import { desenvolver, canchas as api } from '@/lib/api';
import { fechaCorta, fechaISO } from '@/lib/fechas';

export function DialogoAbono({ abierto, alCerrar }: { abierto: boolean; alCerrar: () => void }) {
  const lista = useCanchas();
  const activas = (lista.data ?? []).filter((c) => c.activo);
  const [canchaId, setCanchaId] = useState(0);
  const [dia, setDia] = useState(2);
  const [desde, setDesde] = useState('');
  const [cliente, setCliente] = useState<ClienteElegido | null>(null);
  const [desdeFecha, setDesdeFecha] = useState(fechaISO());
  const [sinFin, setSinFin] = useState(true);
  const [hastaFecha, setHastaFecha] = useState('');
  const [precio, setPrecio] = useState<number | null>(0);
  const [precioTocado, setPrecioTocado] = useState(false);
  const [nota, setNota] = useState('');
  const [error, setError] = useState('');

  const cancha = activas.find((c) => c.id === canchaId);
  const turnos = cancha ? horariosDeCancha(cancha.apertura, cancha.cierre, cancha.duracionMin) : [];

  useEffect(() => {
    if (!abierto) return;
    const primera = activas[0];
    setCanchaId(primera?.id ?? 0);
    setDesde(primera ? (horariosDeCancha(primera.apertura, primera.cierre, primera.duracionMin).find((h) => h >= '20:00') ?? primera.apertura) : '');
    setDia(2);
    setCliente(null);
    setDesdeFecha(fechaISO());
    setSinFin(true);
    setHastaFecha('');
    setPrecioTocado(false);
    setNota('');
    setError('');
    // solo al abrir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, lista.isSuccess]);

  // El precio normal de ese turno (el de la franja horaria, en la primera fecha que toca)
  const primera = cancha && desdeFecha ? fechasDeUnDia(dia, desdeFecha, sumarDias(desdeFecha, 7))[0] : undefined;
  const precioNormal = cancha && primera && desde ? precioDelTurno(cancha, primera, desde) : 0;
  // Mientras no lo toquen a mano, el precio acompaña al normal (con un 10 % de descuento de abonado)
  useEffect(() => {
    if (!precioTocado) setPrecio(Math.round((precioNormal * 0.9) / 10_000) * 10_000);
  }, [precioNormal, precioTocado]);

  const guardar = useAccion((d: ReturnType<typeof esquemaAbono.parse>) => desenvolver(api().abonos.crear(d)), [CLAVES.abonos, CLAVES.reservas, CLAVES.clientes]);

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (!cliente) return setError('Elegí el cliente.');
    if (precio === null) return setError('Escribí el precio.');
    const r = esquemaAbono.safeParse({ canchaId, clienteId: cliente.id, diaSemana: dia, desde, desdeFecha, hastaFecha: sinFin || !hastaFecha ? null : hastaFecha, precioCentavos: precio, nota });
    if (!r.success) return setError(r.error.issues[0]?.message ?? 'Revisá los datos.');
    setError('');
    guardar.mutate(r.data, {
      onSuccess: (res) => {
        toast.success(`Abono creado: ${res.creadas} ${res.creadas === 1 ? 'turno cargado' : 'turnos cargados'}`, {
          description: res.omitidas.length ? `No se pudieron cargar: ${res.omitidas.slice(0, 3).map((o) => `${fechaCorta(o.fecha)} (${o.motivo})`).join(', ')}${res.omitidas.length > 3 ? '…' : ''}` : undefined,
          duration: res.omitidas.length ? 15_000 : undefined,
        });
        alCerrar();
      },
      onError: (err) => setError(err.message),
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={(a) => !a && alCerrar()}>
      <DialogContent className="max-w-[640px] [&>button[aria-label=Cerrar]]:text-white [&>button[aria-label=Cerrar]]:hover:bg-white/15 [&>button[aria-label=Cerrar]]:hover:text-white">
        <form onSubmit={enviar} noValidate className="flex min-h-0 flex-1 flex-col">
          <DialogHeader className="pb-1">
            <div className="fondo-lateral -mt-6 -mr-16 mb-3 -ml-6 flex items-center gap-4 rounded-t-xl px-6 py-4 pr-16 text-white">
              <Repeat className="size-9 shrink-0 text-pelota" aria-hidden="true" />
              <div>
                <DialogTitle className="text-white">Nuevo abono</DialogTitle>
                <DialogDescription className="text-white/85">El mismo turno, todas las semanas, para el mismo cliente.</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-5">
            <Campo etiqueta="¿Quién abona?">
              <SelectorCliente valor={cliente} alElegir={setCliente} />
            </Campo>
            <div className="grid grid-cols-3 gap-4">
              <Campo etiqueta="Cancha">
                <Select
                  value={String(canchaId)}
                  onValueChange={(v) => {
                    const c = activas.find((x) => x.id === Number(v))!;
                    setCanchaId(c.id);
                    const horarios = horariosDeCancha(c.apertura, c.cierre, c.duracionMin);
                    if (!horarios.includes(desde)) setDesde(horarios.find((h) => h >= '20:00') ?? c.apertura);
                  }}
                >
                  <SelectTrigger aria-label="Cancha">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {activas.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Campo>
              <Campo etiqueta="Día de la semana">
                <Select value={String(dia)} onValueChange={(v) => setDia(Number(v))}>
                  <SelectTrigger aria-label="Día de la semana" className="first-letter:uppercase">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(NOMBRE_DIA).map(([n, nombre]) => (
                      <SelectItem key={n} value={n} className="first-letter:uppercase">
                        {nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Campo>
              <Campo etiqueta="Horario">
                <Select value={desde} onValueChange={setDesde}>
                  <SelectTrigger aria-label="Horario" className="numeros">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {turnos.map((h) => (
                      <SelectItem key={h} value={h} className="numeros">
                        {h} a {cancha ? sumarMinutos(h, cancha.duracionMin) : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Campo>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Campo etiqueta="Desde el día" htmlFor="a-desde">
                <Input id="a-desde" type="date" min={fechaISO()} value={desdeFecha} onChange={(e) => setDesdeFecha(e.target.value)} />
              </Campo>
              <div className="flex flex-col gap-2">
                <label htmlFor="a-hasta" className="text-sm font-medium">
                  Hasta el día
                </label>
                {sinFin ? (
                  <button type="button" onClick={() => setSinFin(false)} className="h-11 rounded-md border border-dashed border-linea-fuerte px-3 text-left text-[15px] text-tinta-suave outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-acento/50">
                    Sin fecha de fin · poner una
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <Input id="a-hasta" type="date" min={desdeFecha} value={hastaFecha} onChange={(e) => setHastaFecha(e.target.value)} />
                    <Button variant="ghost" size="sm" className="h-11" onClick={() => setSinFin(true)}>
                      Sin fin
                    </Button>
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Campo etiqueta="Precio de cada turno" htmlFor="a-precio" ayuda={precioNormal ? `Precio normal ${pesos(precioNormal)}; se propone un 10 % menos.` : undefined}>
                <CampoPesos
                  id="a-precio"
                  valor={precio}
                  alCambiar={(p) => {
                    setPrecio(p);
                    setPrecioTocado(true);
                  }}
                />
              </Campo>
              <Campo etiqueta="Nota (opcional)" htmlFor="a-nota" ayuda="Ej.: paga el último del mes.">
                <Input id="a-nota" maxLength={120} value={nota} onChange={(e) => setNota(e.target.value)} />
              </Campo>
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
              <Button type="submit" disabled={guardar.isPending}>
                Crear abono
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
