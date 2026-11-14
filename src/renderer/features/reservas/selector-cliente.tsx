// Elegir el cliente de una reserva: se busca por nombre o teléfono; si no
// está, se crea ahí mismo sin salir de la reserva.
import { useState } from 'react';
import { Check, Plus, Search, UserPlus } from 'lucide-react';
import { esquemaCliente } from '@compartido/esquemas';
import type { Cliente } from '@compartido/tipos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { desenvolver, canchas } from '@/lib/api';
import { cn } from '@/lib/utils';
import { CLAVES, useAccion, useClientes, useDemorado } from '@/features/comun/consultas';

export interface ClienteElegido {
  id: number;
  nombre: string;
  telefono: string;
}

export function SelectorCliente({ valor, alElegir }: { valor: ClienteElegido | null; alElegir: (c: ClienteElegido | null) => void }) {
  const [texto, setTexto] = useState('');
  const [creando, setCreando] = useState(false);
  const [telefono, setTelefono] = useState('');
  const [error, setError] = useState('');
  const buscado = useDemorado(texto.trim());
  const lista = useClientes({ texto: buscado });
  const crear = useAccion((d: { nombre: string; telefono: string }) => desenvolver(canchas().clientes.guardar(d)), [CLAVES.clientes]);

  if (valor) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-acento/40 bg-acento-suave px-3.5 py-2.5">
        <Check className="size-5 shrink-0 text-acento" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{valor.nombre}</p>
          {valor.telefono && <p className="text-[13px] text-tinta-suave">{valor.telefono}</p>}
        </div>
        <Button variant="ghost" size="sm" onClick={() => alElegir(null)}>
          Cambiar
        </Button>
      </div>
    );
  }

  function guardarNuevo() {
    const r = esquemaCliente.safeParse({ nombre: texto, telefono });
    if (!r.success) return setError(r.error.issues[0]?.message ?? 'Revisá los datos.');
    setError('');
    crear.mutate(r.data, {
      onSuccess: (id) => alElegir({ id, nombre: r.data.nombre, telefono: r.data.telefono }),
      onError: (e) => setError(e.message),
    });
  }

  const resultados = (lista.data ?? []).slice(0, 5);
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-tinta-suave" aria-hidden="true" />
        <Input
          autoFocus
          aria-label="Buscar cliente por nombre o teléfono"
          placeholder="Buscar por nombre, equipo o teléfono"
          className="pl-10"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setCreando(false);
            setError('');
          }}
        />
      </div>
      {!creando && (
        <ul className="flex flex-col overflow-hidden rounded-lg border border-linea">
          {resultados.map((c: Cliente) => (
            <li key={c.id} className="border-b border-linea last:border-b-0">
              <button
                type="button"
                onClick={() => alElegir({ id: c.id, nombre: c.nombre, telefono: c.telefono })}
                className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left outline-none hover:bg-accent focus-visible:bg-accent"
              >
                <span className="truncate font-medium">{c.nombre}</span>
                <span className="shrink-0 text-[13px] text-tinta-suave">{c.telefono || 'sin teléfono'}</span>
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => setCreando(true)}
              className={cn('flex w-full items-center gap-2 bg-secondary/60 px-3.5 py-2.5 text-left font-semibold text-acento outline-none hover:bg-secondary focus-visible:bg-secondary')}
            >
              <UserPlus className="size-[18px]" aria-hidden="true" />
              {texto.trim() ? `Cliente nuevo: "${texto.trim()}"` : 'Cliente nuevo'}
            </button>
          </li>
        </ul>
      )}
      {creando && (
        <div className="flex flex-col gap-3 rounded-lg border border-linea bg-secondary/50 p-3.5">
          <p className="text-sm font-semibold">Cliente nuevo</p>
          <Input aria-label="Nombre del cliente o del equipo" placeholder="Nombre o equipo" maxLength={60} value={texto} onChange={(e) => setTexto(e.target.value)} />
          <Input aria-label="Teléfono (opcional)" placeholder="Teléfono (opcional)" inputMode="tel" maxLength={30} value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          {error && (
            <p role="alert" className="text-[13px] font-medium text-rojo">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={guardarNuevo} disabled={crear.isPending}>
              <Plus aria-hidden="true" /> Guardar y elegir
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCreando(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
