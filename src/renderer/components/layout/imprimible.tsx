// Imprimir: se dibuja lo que se quiere imprimir en una "zona de impresión" (fuera
// de la pantalla) y se llama a window.print(). Con la regla @media print de
// index.css, el papel muestra SOLO esa zona. Cuando el diálogo de impresión se
// cierra (evento "afterprint") la zona se saca.
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function Imprimible({ children, alTerminar }: { children: ReactNode; alTerminar: () => void }) {
  useEffect(() => {
    window.addEventListener('afterprint', alTerminar, { once: true });
    // Un instante para que el navegador dibuje la zona antes de imprimir
    const t = window.setTimeout(() => window.print(), 60);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('afterprint', alTerminar);
    };
    // solo al montar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return createPortal(<div className="zona-impresion">{children}</div>, document.body);
}
