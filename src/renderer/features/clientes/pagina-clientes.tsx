// Clientes: la lista de quienes reservan (personas o equipos), con búsqueda.
import { useState } from 'react';
import { toast } from 'sonner';
import { Pencil, Plus, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { desenvolver, canchas } from '@/lib/api';
import { CLAVES, useAccion, useClientes, useDemorado } from '@/features/comun/consultas';
import { Encabezado, Vacio } from '@/features/comun/encabezado';
import type { Cliente } from '@compartido/tipos';
import { DialogoCliente } from './dialogo-cliente';

export function PaginaClientes() {
  const [texto, setTexto] = useState('');
  const [bajas, setBajas] = useState(false);
  const [editando, setEditando] = useState<{ cliente: Cliente | null } | null>(null);
  const buscado = useDemorado(texto.trim());
  const clientes = useClientes({ texto: buscado, incluirBajas: bajas });
  const activo = useAccion(({ id, a }: { id: number; a: boolean }) => desenvolver(canchas().clientes.cambiarActivo(id, a)), [CLAVES.clientes], 'Listo');
  const lista = clientes.data ?? [];

  return (
    <div className="mx-auto flex max-w-[980px] flex-col gap-6 px-10 pt-9 pb-12">
      <Encabezado titulo="Clientes" detalle="Las personas y los equipos que reservan. Se pueden cargar acá o directo al hacer una reserva.">
        <Button onClick={() => setEditando({ cliente: null })}>
          <Plus aria-hidden="true" /> Nuevo cliente
        </Button>
      </Encabezado>
      <div className="flex items-center gap-4">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-tinta-suave" aria-hidden="true" />
          <Input aria-label="Buscar cliente" placeholder="Buscar por nombre, equipo o teléfono" className="pl-10" value={texto} onChange={(e) => setTexto(e.target.value)} />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-[14px] text-tinta-suave">
          <input type="checkbox" className="size-4 accent-[var(--acento)]" checked={bajas} onChange={(e) => setBajas(e.target.checked)} />
          Mostrar los dados de baja
        </label>
      </div>
      {clientes.isError ? (
        <p role="alert" className="text-rojo">
          {clientes.error.message}
        </p>
      ) : lista.length === 0 && !clientes.isPending ? (
        <Vacio titulo={buscado ? 'No encontramos a nadie con eso' : 'Todavía no hay clientes'}>
          {buscado ? 'Probá con otro nombre o con el teléfono.' : 'Se cargan solos al hacer la primera reserva, o con el botón "Nuevo cliente".'}
        </Vacio>
      ) : (
        <ul className="divide-y divide-linea overflow-hidden rounded-xl border border-linea bg-superficie">
          {lista.map((c) => (
            <li key={c.id} className="flex min-h-16 items-center gap-4 px-5 py-2.5">
              <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-acento-suave font-display text-[16px] font-bold text-acento-fuerte">
                {c.nombre.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-[17px] font-bold">
                  {c.nombre}
                  {!c.activo && (
                    <Badge className="ml-2 align-middle" variant="contorno">
                      De baja
                    </Badge>
                  )}
                </p>
                <p className="truncate text-[13px] text-tinta-suave">{[c.telefono, c.notas].filter(Boolean).join(' · ') || 'Sin teléfono ni notas'}</p>
              </div>
              <span className="numeros w-24 text-right text-[13px] text-tinta-suave">{c.reservas === 1 ? '1 reserva' : `${c.reservas} reservas`}</span>
              <Button variant="ghost" size="icon-sm" aria-label={`Editar a ${c.nombre}`} onClick={() => setEditando({ cliente: c })}>
                <Pencil aria-hidden="true" />
              </Button>
              <Button variant="ghost" size="sm" className="w-28" onClick={() => activo.mutate({ id: c.id, a: !c.activo }, { onError: (e) => toast.error(e.message) })}>
                {c.activo ? 'Dar de baja' : 'Reactivar'}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <DialogoCliente abierto={editando !== null} cliente={editando?.cliente ?? null} alCerrar={() => setEditando(null)} />
    </div>
  );
}
