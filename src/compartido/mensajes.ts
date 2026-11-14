// Mensajes de WhatsApp: el teléfono "limpio" y el texto de cada aviso.
// Son funciones puras (sin Electron ni base de datos), así se prueban fácil.
//
// Importante: el programa NO manda el mensaje solo. Arma un enlace
// https://wa.me/<número>?text=<mensaje> y lo abre: se abre WhatsApp con el
// texto ya escrito y la persona del complejo toca "Enviar". Así no hace falta
// ninguna cuenta de empresa, ni pagar, ni pedir permisos a Meta.
import { diaDeLaSemana, NOMBRE_DIA } from './horarios';
import { pesos } from './dinero';

export const TIPOS_DE_AVISO = ['recordatorio', 'cobro'] as const;
export type TipoDeAviso = (typeof TIPOS_DE_AVISO)[number];

export const NOMBRE_AVISO: Record<TipoDeAviso, string> = {
  recordatorio: 'Recordar el turno',
  cobro: 'Reclamar el saldo',
};

/**
 * Deja el teléfono como lo pide WhatsApp para Argentina: solo números, con 54 9
 * adelante ("5493704551020"). Acepta como lo escribe la gente:
 *   "370 455-1020", "0370 455-1020", "+54 9 370 455 1020", "0370 15 455-1020".
 * Devuelve null si no alcanza para armar un número (menos de 10 cifras).
 */
export function telefonoParaWhatsApp(texto: string): string | null {
  let n = texto.replace(/\D/g, '');
  if (n.startsWith('00')) n = n.slice(2);
  if (n.startsWith('54')) {
    n = n.slice(2);
    if (n.startsWith('9')) n = n.slice(1);
  }
  if (n.startsWith('0')) n = n.slice(1);
  // El "15" de los celulares viejos: código de área (2 a 4 cifras) + 15 + número.
  if (n.length === 12) {
    for (const area of [2, 3, 4]) {
      if (n.slice(area, area + 2) === '15') {
        n = n.slice(0, area) + n.slice(area + 2);
        break;
      }
    }
  }
  if (!/^\d{10}$/.test(n)) return null;
  return `549${n}`;
}

export interface DatosDelAviso {
  complejo: string;
  cliente: string;
  cancha: string;
  fecha: string; // AAAA-MM-DD
  desde: string;
  /** Lo que falta pagar (solo para el cobro). */
  saldoCentavos?: number;
}

const diaYFecha = (fecha: string) => {
  const [, m, d] = fecha.split('-');
  return `${NOMBRE_DIA[diaDeLaSemana(fecha)]} ${Number(d)}/${Number(m)}`;
};

/** Primer nombre o el nombre del equipo, para saludar sin sonar a formulario. */
const saludo = (cliente: string) => cliente.trim().split(/\s+/).slice(0, 2).join(' ');

export function armarMensaje(tipo: TipoDeAviso, d: DatosDelAviso): string {
  const turno = `${d.cancha}, ${diaYFecha(d.fecha)} a las ${d.desde} h`;
  if (tipo === 'recordatorio') {
    return `Hola ${saludo(d.cliente)}! Te recordamos tu turno en ${d.complejo}: ${turno}. Si no podés venir, avisanos así liberamos la cancha. ¡Los esperamos!`;
  }
  const saldo = d.saldoCentavos && d.saldoCentavos > 0 ? ` Quedó un saldo de ${pesos(d.saldoCentavos)}.` : '';
  return `Hola ${saludo(d.cliente)}! Te escribimos de ${d.complejo} por tu turno (${turno}).${saldo} Cuando puedas pasá a saldarlo o avisanos cómo lo abonás. ¡Gracias!`;
}

export function enlaceDeWhatsApp(telefono: string, texto: string): string {
  return `https://wa.me/${telefono}?text=${encodeURIComponent(texto)}`;
}
