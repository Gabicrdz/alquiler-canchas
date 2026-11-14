// Cobrar (o completar) la inscripción de un equipo.
import { useEffect, useState } from 'react';
import { METODOS, NOMBRE_METODO } from '@compartido/esquemas';
import { pesos } from '@compartido/dinero';
import type { Equipo } from '@compartido/tipos';
import { Button } from '@/components/ui/button';
import { CampoPesos } from '@/components/ui/campo-pesos';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CLAVES, useAccion } from '@/features/comun/consultas';
import { desenvolver, canchas } from '@/lib/api';
import { cn } from '@/lib/utils';

export function DialogoCobroEquipo({ equipo, cuotaCentavos, alCerrar }: { equipo: Equipo | null; cuotaCentavos: number; alCerrar: () => void }) {
  const saldo = equipo ? cuotaCentavos - equipo.pagadoCentavos : 0;
  const [monto, setMonto] = useState<number | null>(0);
  const [metodo, setMetodo] = useState<(typeof METODOS)[number]>('efectivo');
  const [error, setError] = useState('');
  useEffect(() => {
    setMonto(saldo);
    setError('');
  }, [equipo?.id, saldo]);

  const cobrar = useAccion((d: { equipoId: number; montoCentavos: number; metodo: (typeof METODOS)[number] }) => desenvolver(canchas().torneos.cobrarEquipo(d)), [CLAVES.torneos], 'Inscripción cobrada');

  return (
    <Dialog open={equipo !== null} onOpenChange={(a) => !a && alCerrar()}>
      <DialogContent className="max-w-[480px]">
        {equipo && (
          <>
            <DialogHeader>
              <DialogTitle>Cobrar inscripción</DialogTitle>
              <DialogDescription>
                {equipo.nombre} · falta {pesos(saldo)} de {pesos(cuotaCentavos)}
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="flex flex-col gap-4">
              <div className="w-[180px]">
                <label htmlFor="ce-monto" className="mb-2 block text-sm font-medium">
                  Cobrar
                </label>
                <CampoPesos id="ce-monto" valor={monto} alCambiar={setMonto} />
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
              <p role="alert" className="text-[14px] font-medium text-rojo">
                {error}
              </p>
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={alCerrar}>
                Cancelar
              </Button>
              <Button
                disabled={cobrar.isPending}
                onClick={() => {
                  if (!monto) return setError('Escribí cuánto paga.');
                  cobrar.mutate({ equipoId: equipo.id, montoCentavos: monto, metodo }, { onSuccess: alCerrar, onError: (e) => setError(e.message) });
                }}
              >
                Cobrar {monto ? pesos(monto) : ''}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
