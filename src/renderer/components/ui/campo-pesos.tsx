import { useEffect, useState } from 'react';
import { leerPesos, pesosParaCampo } from '@compartido/dinero';
import { Input } from './input';

/**
 * Campo de importe en pesos. Muestra "$" adelante, entiende "8500", "8.500" o
 * "8.500,50" y le avisa a la pantalla el valor en CENTAVOS (null si no es un importe).
 */
export function CampoPesos({
  id,
  valor,
  alCambiar,
  ...resto
}: { valor: number | null; alCambiar: (centavos: number | null) => void } & Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'>) {
  const [texto, setTexto] = useState(valor === null ? '' : pesosParaCampo(valor));
  // Si la pantalla cambia el valor por su cuenta (por ejemplo, al elegir otra cancha), el campo lo sigue
  useEffect(() => {
    if (valor !== leerPesos(texto)) setTexto(valor === null ? '' : pesosParaCampo(valor));
    // solo cuando cambia el valor de afuera
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor]);
  return (
    <div className="relative">
      <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-tinta-suave">
        $
      </span>
      <Input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        className="numeros pl-8"
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          alCambiar(leerPesos(e.target.value));
        }}
        onBlur={() => valor !== null && setTexto(pesosParaCampo(valor))}
        {...resto}
      />
    </div>
  );
}
