import type { ReactNode } from 'react';

/** Título de cada pantalla (en Bricolage), una línea de ayuda y las acciones a la derecha. */
export function Encabezado({ titulo, detalle, children }: { titulo: string; detalle?: ReactNode; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-linea pb-5">
      <div>
        <h1 className="font-display text-[38px] leading-none font-extrabold tracking-[-0.02em]">{titulo}</h1>
        {detalle && <p className="mt-2 text-tinta-suave">{detalle}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </header>
  );
}

/** Mensaje grande para cuando no hay nada que mostrar. */
export function Vacio({ titulo, children, acciones }: { titulo: string; children?: ReactNode; acciones?: ReactNode }) {
  return (
    <section className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-linea-fuerte bg-superficie/60 px-8 py-14 text-center">
      <h2 className="font-display text-2xl font-bold">{titulo}</h2>
      {children && <p className="max-w-md text-tinta-suave">{children}</p>}
      {acciones && <div className="mt-3 flex flex-wrap justify-center gap-2">{acciones}</div>}
    </section>
  );
}
