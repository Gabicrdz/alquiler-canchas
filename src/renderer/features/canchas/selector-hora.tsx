import { aHora } from '@compartido/horarios';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const DESDE = Array.from({ length: 48 }, (_, i) => aHora(i * 30)); // 00:00 … 23:30
const HASTA = [...DESDE.slice(1), '24:00']; // 00:30 … 24:00

/** Elegir una hora (de media en media). Con `fin`, también se puede elegir 24:00 (medianoche). */
export function SelectorHora({ valor, alCambiar, fin = false, etiqueta }: { valor: string; alCambiar: (hora: string) => void; fin?: boolean; etiqueta: string }) {
  return (
    <Select value={valor} onValueChange={alCambiar}>
      <SelectTrigger aria-label={etiqueta} className="numeros">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {(fin ? HASTA : DESDE).map((h) => (
          <SelectItem key={h} value={h} className="numeros">
            {h}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
