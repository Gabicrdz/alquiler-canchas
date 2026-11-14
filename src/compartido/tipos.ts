// Tipos que comparten el main y la ventana (lo que VUELVE del main).
import type { ESTADOS_TORNEO, METODOS, ROLES } from './esquemas';
import type { Deporte, EstadoDePago, EstadoReserva, MotivoBloqueo, Tarifa } from './canchas';

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
  /** Si es un turno de un abono fijo, de cuál (si no, null). */
  abonoId: number | null;
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

// ---------- Abonos y bloqueos ----------
export interface Abono {
  id: number;
  canchaId: number;
  cancha: string;
  deporte: Deporte;
  clienteId: number;
  cliente: string;
  telefono: string;
  /** 1 = lunes … 7 = domingo. */
  diaSemana: number;
  desde: string;
  hasta: string;
  desdeFecha: string;
  hastaFecha: string | null;
  precioCentavos: number;
  nota: string;
  activo: boolean;
  /** El próximo turno que le toca (null si no tiene ninguno pendiente) y cuántos tiene cargados por delante. */
  proxima: string | null;
  pendientes: number;
}

export interface ResultadoAbono {
  id: number;
  creadas: number;
  /** Fechas que no se pudieron reservar (ya estaban ocupadas, bloqueadas, etc.). */
  omitidas: { fecha: string; motivo: string }[];
}

export interface Bloqueo {
  id: number;
  canchaId: number | null;
  /** null = todas las canchas. */
  cancha: string | null;
  fechaDesde: string;
  fechaHasta: string;
  desde: string | null;
  hasta: string | null;
  motivo: MotivoBloqueo;
  nota: string;
}

export interface ResultadoBloqueo {
  id: number;
  /** Cuántas reservas se cancelaron para poder bloquear. */
  canceladas: number;
}

// ---------- Reportes ----------
export interface ResumenReporte {
  /** Reservas del período que no se cancelaron. */
  reservas: number;
  jugadas: number;
  ausentes: number;
  pendientes: number;
  canceladas: number;
  /** Turnos que las canchas ofrecían (sin los bloqueados) y cuántos se ocuparon. */
  turnosDisponibles: number;
  turnosOcupados: number;
  /** 0 a 1. */
  ocupacion: number;
  /** Plata que entró en el período (por fecha del cobro, sin pagos anulados). */
  cobradoCentavos: number;
  /** Lo que falta cobrar de turnos ya jugados del período. */
  porCobrarCentavos: number;
}

export interface Reporte {
  desde: string;
  hasta: string;
  resumen: ResumenReporte;
  porMetodo: { metodo: MetodoPago; centavos: number; cobros: number }[];
  porCancha: { canchaId: number; nombre: string; deporte: string; reservas: number; turnosDisponibles: number; ocupacion: number; cobradoCentavos: number }[];
  porDia: { fecha: string; cobradoCentavos: number; reservas: number }[];
  /** Día de la semana (1 a 7) × hora de inicio: cuánto se ocupó cada franja. */
  mapa: { dia: number; hora: string; ocupados: number; disponibles: number }[];
  topClientes: { clienteId: number; nombre: string; reservas: number; gastoCentavos: number }[];
  deudores: { reservaId: number; clienteId: number; cliente: string; telefono: string; cancha: string; fecha: string; desde: string; saldoCentavos: number }[];
}

/** Lo que devuelve "avisar por WhatsApp": el programa abre WhatsApp y cuenta a quién. */
export interface ResultadoAviso {
  telefono: string;
  cliente: string;
}

// ---------- Torneos ----------
export type EstadoTorneo = (typeof ESTADOS_TORNEO)[number];

export interface Torneo {
  id: number;
  nombre: string;
  deporte: Deporte;
  fechaDesde: string;
  fechaHasta: string;
  cuotaCentavos: number;
  estado: EstadoTorneo;
  nota: string;
  bloqueoId: number | null;
  equipos: number;
  partidos: number;
  partidosJugados: number;
  /** Inscripciones cobradas (sin pagos anulados). */
  cobradoCentavos: number;
}

export interface Equipo {
  id: number;
  nombre: string;
  telefono: string;
  pagadoCentavos: number;
  estadoDePago: EstadoDePago;
  pagos: PagoDeReserva[];
}

export interface Partido {
  id: number;
  ronda: number;
  localId: number;
  visitanteId: number;
  local: string;
  visitante: string;
  fecha: string | null;
  hora: string | null;
  canchaId: number | null;
  cancha: string | null;
  golesLocal: number | null;
  golesVisitante: number | null;
}

export interface Posicion {
  equipoId: number;
  nombre: string;
  pj: number;
  pg: number;
  pe: number;
  pp: number;
  gf: number;
  gc: number;
  dg: number;
  pts: number;
}

export interface DetalleTorneo extends Torneo {
  listaDeEquipos: Equipo[];
  listaDePartidos: Partido[];
  posiciones: Posicion[];
}
