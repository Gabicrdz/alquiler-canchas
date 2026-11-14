// Tipos que comparten el main y la ventana (lo que VUELVE del main).
import type { METODOS, ROLES } from './esquemas';
import type { Deporte, EstadoDePago, EstadoReserva, Tarifa } from './canchas';

export type Respuesta<T> = { ok: true; datos: T } | { ok: false; error: string };

export type MetodoPago = (typeof METODOS)[number];

export interface Cancha {
  id: number;
  nombre: string;
  deporte: Deporte;
  detalle: string;
  techada: boolean;
  duracionMin: number;
  apertura: string;
  cierre: string;
  precioBaseCentavos: number;
  activo: boolean;
  tarifas: Tarifa[];
}

export interface Cliente {
  id: number;
  nombre: string;
  telefono: string;
  notas: string;
  activo: boolean;
  /** Reservas que no se cancelaron (para ver quién viene seguido). */
  reservas: number;
}

export interface Complejo {
  nombre: string;
  direccion: string;
  telefono: string;
  senaPorcentaje: number;
}

export interface Resumen {
  canchas: number;
  clientes: number;
  /** Todas las reservas cargadas (para saber si la grilla está vacía). */
  reservas: number;
}

export interface InfoSistema {
  version: string;
  baseDeDatos: string;
}

export interface PagoDeReserva {
  id: number;
  montoCentavos: number;
  metodo: MetodoPago;
  /** Quién cobró y cuándo. */
  usuario: string | null;
  creadoEn: string;
}

export interface Reserva {
  id: number;
  canchaId: number;
  clienteId: number;
  fecha: string;
  desde: string;
  hasta: string;
  estado: EstadoReserva;
  precioCentavos: number;
  nota: string;
  /** Lo que ya pagó (sin los pagos anulados). */
  pagadoCentavos: number;
  estadoDePago: EstadoDePago;
  pagos: PagoDeReserva[];
  cliente: string;
  telefono: string;
  /** Quién cargó la reserva (null si se cargó antes de que hubiera usuarios) y cuándo. */
  dadoPor: string | null;
  creadoEn: string;
}

export type Rol = (typeof ROLES)[number];

export const NOMBRE_ROL: Record<Rol, string> = {
  admin: 'Administración',
  encargado: 'Encargado',
};

export interface Usuario {
  id: number;
  nombre: string;
  rol: Rol;
}

/** Lo que devuelve "Cargar datos de ejemplo": los conteos y los usuarios creados con su PIN. */
export interface ResultadoEjemplo extends Resumen {
  usuarios: { nombre: string; rol: Rol; pin: string }[];
}

// ---------- Copias de seguridad ----------
export interface InfoCopia {
  ruta: string;
  nombre: string;
  /** 'AAAA-MM-DD HH:MM' */
  fecha: string;
  bytes: number;
}
export interface EstadoCopias {
  carpeta: string;
  automaticas: InfoCopia[];
  baseDeDatos: string;
}
/** Lo que se encontró en la copia elegida, para confirmar antes de restaurar. */
export interface CopiaElegida {
  nombre: string;
  descripcion: string;
}
