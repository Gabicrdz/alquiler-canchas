// Ajustes: datos del complejo, usuarios y copias de seguridad.
import { useEffect, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { esquemaComplejo, type DatosComplejo } from '@compartido/esquemas';
import { Button } from '@/components/ui/button';
import { Campo } from '@/components/ui/campo';
import { Input } from '@/components/ui/input';
import { desenvolver, canchas } from '@/lib/api';
import { CLAVES, useAccion, useComplejo } from '@/features/comun/consultas';
import { Encabezado } from '@/features/comun/encabezado';
import { TarjetaCopias } from './tarjeta-copias';
import { TarjetaUsuarios } from './tarjeta-usuarios';

export function PaginaAjustes() {
  const info = useQuery({ queryKey: ['sistema'], queryFn: () => desenvolver(canchas().sistema.info()) });
  return (
    <div className="mx-auto flex max-w-[980px] flex-col gap-8 px-10 pt-9 pb-12">
      <Encabezado titulo="Ajustes" detalle="Datos del complejo, usuarios y copias de seguridad." />
      <TarjetaComplejo />
      <TarjetaUsuarios />
      <TarjetaCopias />
      {info.data && (
        <p className="text-center text-[13px] text-tinta-suave">
          Canchas versión {info.data.version} · Base de datos: <span className="break-all">{info.data.baseDeDatos}</span>
        </p>
      )}
    </div>
  );
}

function TarjetaComplejo() {
  const complejo = useComplejo();
  const [f, setF] = useState<{ nombre: string; direccion: string; telefono: string; senaPorcentaje: string }>({ nombre: '', direccion: '', telefono: '', senaPorcentaje: '30' });
  const [error, setError] = useState('');
  const guardar = useAccion((d: DatosComplejo) => desenvolver(canchas().complejo.guardar(d)), [CLAVES.complejo], 'Datos del complejo guardados');
  useEffect(() => {
    if (complejo.data) setF({ ...complejo.data, senaPorcentaje: String(complejo.data.senaPorcentaje) });
  }, [complejo.data]);
  const c = complejo.data;
  const cambio = !!c && (f.nombre !== c.nombre || f.direccion !== c.direccion || f.telefono !== c.telefono || f.senaPorcentaje !== String(c.senaPorcentaje));

  function enviar(e: FormEvent) {
    e.preventDefault();
    const datos = { ...f, senaPorcentaje: f.senaPorcentaje === '' ? NaN : Number(f.senaPorcentaje) };
    const r = esquemaComplejo.safeParse(datos);
    if (!r.success) return setError(Number.isNaN(datos.senaPorcentaje) ? 'Escribí el porcentaje de la seña (0 si no pedís).' : (r.error.issues[0]?.message ?? 'Revisá los datos.'));
    setError('');
    guardar.mutate(r.data, { onError: (err) => setError(err.message) });
  }

  return (
    <section className="rounded-2xl border border-linea bg-superficie p-6">
      <h2 className="font-display text-xl font-bold">Complejo</h2>
      <p className="text-[14px] text-tinta-suave">El nombre aparece arriba a la izquierda y en la pantalla de ingreso.</p>
      <form onSubmit={enviar} noValidate className="mt-4 grid grid-cols-2 gap-4">
        <Campo etiqueta="Nombre del complejo" htmlFor="c-nombre" className="col-span-2">
          <Input id="c-nombre" maxLength={50} value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
        </Campo>
        <Campo etiqueta="Dirección (opcional)" htmlFor="c-direccion">
          <Input id="c-direccion" maxLength={80} value={f.direccion} onChange={(e) => setF({ ...f, direccion: e.target.value })} />
        </Campo>
        <Campo etiqueta="Teléfono (opcional)" htmlFor="c-telefono">
          <Input id="c-telefono" inputMode="tel" maxLength={40} value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} />
        </Campo>
        <Campo etiqueta="Seña que se propone (%)" htmlFor="c-sena" ayuda="Al reservar se propone ese porcentaje del precio como seña. Con 0 no se propone seña.">
          <Input id="c-sena" inputMode="numeric" maxLength={3} className="numeros w-28" value={f.senaPorcentaje} onChange={(e) => setF({ ...f, senaPorcentaje: e.target.value.replace(/\D/g, '') })} />
        </Campo>
        <div className="col-span-2 flex items-center gap-3">
          <Button type="submit" disabled={!cambio || guardar.isPending}>
            Guardar cambios
          </Button>
          {error && (
            <p role="alert" className="text-sm font-semibold text-rojo">
              {error}
            </p>
          )}
        </div>
      </form>
    </section>
  );
}
