import { abrirBaseDeDatos, cerrarBaseDeDatos, type BaseDeDatos } from '../src/main/db/conexion';
import { esquemaCancha, esquemaCliente, esquemaReserva, type DatosCancha, type DatosCliente, type DatosReserva } from '../src/compartido/esquemas';
import { guardarCancha } from '../src/main/servicios/canchas';
import { guardarCliente } from '../src/main/servicios/clientes';
import { crearReserva } from '../src/main/servicios/reservas';
import { guardarUsuario } from '../src/main/servicios/usuarios';
import { esquemaUsuario } from '../src/compartido/esquemas';

/** Una base nueva y vacía, en memoria, para cada prueba. */
export function baseNueva(): BaseDeDatos {
  cerrarBaseDeDatos();
  return abrirBaseDeDatos(':memory:');
}

/** Un miércoles al mediodía: la fecha "de hoy" de las pruebas (2026-11-11). */
export const AHORA = new Date(2026, 10, 11, 12, 0);
export const HOY = '2026-11-11';
export const MANANA = '2026-11-12';
export const SABADO = '2026-11-14';

/** Una cancha de fútbol (60 min, de 15 a 24) con precio de día y de noche. Pasa por Zod, como cuando llega de la ventana. */
export function cancha(db: BaseDeDatos, datos: Partial<DatosCancha> = {}) {
  return guardarCancha(
    db,
    esquemaCancha.parse({
      nombre: 'Cancha 1',
      deporte: 'futbol',
      duracionMin: 60,
      apertura: '15:00',
      cierre: '24:00',
      precioBaseCentavos: 2_000_000,
      tarifas: [],
      ...datos,
    }),
    AHORA,
  );
}

export function cliente(db: BaseDeDatos, datos: Partial<DatosCliente> = {}) {
  return guardarCliente(db, esquemaCliente.parse({ nombre: 'Los Pibes', telefono: '370 455-1020', ...datos }));
}

export function usuario(db: BaseDeDatos, nombre = 'Ana', rol: 'admin' | 'encargado' = 'admin') {
  return guardarUsuario(db, esquemaUsuario.parse({ nombre, rol, pin: '1234' }));
}

/** Reserva con datos mínimos (cancha, cliente y usuario ya creados). */
export function reservar(db: BaseDeDatos, datos: Partial<DatosReserva> & { canchaId: number; clienteId: number }, usuarioId: number | null = null, ahora = AHORA) {
  const uid = usuarioId ?? usuario(db, `U${Math.random()}`);
  return crearReserva(db, esquemaReserva.parse({ fecha: MANANA, desde: '20:00', ...datos }), ahora, uid);
}
