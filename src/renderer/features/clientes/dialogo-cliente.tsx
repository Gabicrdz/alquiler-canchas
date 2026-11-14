import { useEffect, useState, type FormEvent } from 'react';
import { esquemaCliente, type DatosCliente } from '@compartido/esquemas';
import type { Cliente } from '@compartido/tipos';
import { Button } from '@/components/ui/button';
import { Campo } from '@/components/ui/campo';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { desenvolver, canchas } from '@/lib/api';
import { CLAVES, useAccion } from '@/features/comun/consultas';

export function DialogoCliente({ abierto, cliente, alCerrar }: { abierto: boolean; cliente: Cliente | null; alCerrar: () => void }) {
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [notas, setNotas] = useState('');
  const [error, setError] = useState('');
  const guardar = useAccion((d: DatosCliente) => desenvolver(canchas().clientes.guardar(d)), [CLAVES.clientes, CLAVES.reservas], 'Cliente guardado');

  useEffect(() => {
    if (!abierto) return;
    setNombre(cliente?.nombre ?? '');
    setTelefono(cliente?.telefono ?? '');
    setNotas(cliente?.notas ?? '');
    setError('');
  }, [abierto, cliente]);

  function enviar(e: FormEvent) {
    e.preventDefault();
    const datos = { id: cliente?.id, nombre, telefono, notas };
    const r = esquemaCliente.safeParse(datos);
    if (!r.success) return setError(r.error.issues[0]?.message ?? 'Revisá los datos.');
    setError('');
    guardar.mutate(datos, { onSuccess: alCerrar, onError: (err) => setError(err.message) });
  }

  return (
    <Dialog open={abierto} onOpenChange={(a) => !a && alCerrar()}>
      <DialogContent className="max-w-[520px]">
        <form onSubmit={enviar} noValidate className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>{cliente ? 'Editar cliente' : 'Nuevo cliente'}</DialogTitle>
            <DialogDescription>Puede ser una persona o el nombre de un equipo.</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <Campo etiqueta="Nombre o equipo" htmlFor="k-nombre">
              <Input id="k-nombre" autoFocus maxLength={60} value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </Campo>
            <Campo etiqueta="Teléfono (opcional)" htmlFor="k-tel">
              <Input id="k-tel" inputMode="tel" maxLength={30} value={telefono} onChange={(e) => setTelefono(e.target.value)} />
            </Campo>
            <Campo etiqueta="Notas (opcional)" htmlFor="k-notas" ayuda="Ej.: juegan los jueves, pagan siempre en efectivo.">
              <Textarea id="k-notas" rows={3} maxLength={300} value={notas} onChange={(e) => setNotas(e.target.value)} />
            </Campo>
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
      </DialogContent>
    </Dialog>
  );
}
