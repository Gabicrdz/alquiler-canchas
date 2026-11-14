// Conecta los pedidos de la ventana (ipcRenderer.invoke) con los servicios.
// Cada canal:
//   1. revisa QUIÉN pide (sesión y rol). Los permisos se controlan ACÁ, en el
//      main: esconder un botón en la ventana no alcanza, porque la ventana
//      podría pedir cualquier cosa;
//   2. valida lo que llega con Zod ANTES de tocar la base de datos.
import { ipcMain } from 'electron';
import { z, type ZodType } from 'zod';
import { CANALES } from '@compartido/api';
import {
  esquemaBuscarClientes,
  esquemaCancelacion,
  esquemaCancha,
  esquemaCliente,
  esquemaComplejo,
  esquemaEstado,
  esquemaPago,
  esquemaPin,
  esquemaRango,
  esquemaReserva,
  esquemaUsuario,
  id,
} from '@compartido/esquemas';
import type { InfoSistema, Respuesta, Usuario } from '@compartido/tipos';
import { obtenerDb } from './db/conexion';
import { ErrorDeUsuario } from './servicios/errores';
import { cambiarActivoCancha, guardarCancha, listarCanchas } from './servicios/canchas';
import { buscarClientes, cambiarActivoCliente, guardarCliente } from './servicios/clientes';
import { cancelarReserva, cambiarEstado, crearReserva, reservasDelRango } from './servicios/reservas';
import { anularPago, registrarPago } from './servicios/pagos';
import { guardarComplejo, obtenerComplejo, resumen } from './servicios/complejo';
import { cargarEjemplo } from './servicios/ejemplo';
import { darDeBajaUsuario, guardarUsuario, hayUsuarios, listarUsuarios } from './servicios/usuarios';
import { abrirCarpetaCopias, elegirCopia, estadoCopias, exportarCopia, restaurarCopiaElegida } from './copias';
import { cerrarSesion, iniciarSesion, refrescarSesion, requerir, sesionActual, type Permiso } from './servicios/sesion';

/** Convierte cualquier error en un mensaje para la ventana. */
export function mensajeDeError(error: unknown): string {
  if (error instanceof ErrorDeUsuario) return error.message;
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? 'Hay datos inválidos.';
  console.error(error);
  return 'Ocurrió un error inesperado. Si se repite, avisale a quien te instaló el sistema.';
}

/**
 * Registra un canal con su permiso ('libre', 'sesion' o 'admin').
 * `esquema` describe los argumentos que manda la ventana (como lista);
 * `fn` los recibe ya validados y, al final, el usuario de la sesión.
 */
export function manejar<E extends ZodType<unknown[]>, T>(
  canal: string,
  permiso: Permiso,
  esquema: E,
  fn: (...args: [...z.output<E>, Usuario]) => T | Promise<T>,
): void {
  ipcMain.handle(canal, async (_evento, ...args: unknown[]): Promise<Respuesta<T>> => {
    try {
      const usuario = requerir(permiso);
      const validados = esquema.parse(args) as z.output<E>;
      return { ok: true, datos: await fn(...validados, usuario as Usuario) };
    } catch (error) {
      return { ok: false, error: mensajeDeError(error) };
    }
  });
}

const nada = z.tuple([]);
const activo = z.boolean();

export function registrarCanales(info: () => InfoSistema): void {
  const db = () => obtenerDb();

  // ── Sesión y usuarios ──
  manejar(CANALES.sesionActual, 'libre', nada, () => sesionActual());
  manejar(CANALES.sesionIniciar, 'libre', z.tuple([id, z.string().max(10)]), (uid, pin) => iniciarSesion(db(), uid, pin));
  manejar(CANALES.sesionCerrar, 'libre', nada, () => {
    cerrarSesion();
    return null;
  });
  manejar(CANALES.usuariosParaIngresar, 'libre', nada, () => listarUsuarios(db()));
  manejar(CANALES.usuariosCrearPrimero, 'libre', z.tuple([z.string(), esquemaPin]), (nombre, pin) => {
    // Solo sirve la primera vez: después, los usuarios los crea administración
    if (hayUsuarios(db())) throw new ErrorDeUsuario('Ya hay usuarios creados. Ingresá con tu PIN.');
    const nuevo = guardarUsuario(db(), esquemaUsuario.parse({ nombre, rol: 'admin', pin }));
    return iniciarSesion(db(), nuevo, pin);
  });
  manejar(CANALES.usuariosListar, 'admin', nada, () => listarUsuarios(db()));
  manejar(CANALES.usuariosGuardar, 'admin', z.tuple([esquemaUsuario]), (datos) => {
    const uid = guardarUsuario(db(), datos);
    refrescarSesion(listarUsuarios(db()).find((u) => u.id === uid) ?? null);
    return uid;
  });
  manejar(CANALES.usuariosBaja, 'admin', z.tuple([id]), (uid, yo) => {
    darDeBajaUsuario(db(), uid, yo.id);
    return null;
  });

  // ── Canchas (la configuración, solo administración) ──
  manejar(CANALES.canchasListar, 'sesion', nada, () => listarCanchas(db()));
  manejar(CANALES.canchasGuardar, 'admin', z.tuple([esquemaCancha]), (datos) => guardarCancha(db(), datos));
  manejar(CANALES.canchasActivo, 'admin', z.tuple([id, activo]), (cid, a) => {
    cambiarActivoCancha(db(), cid, a);
    return null;
  });

  // ── Clientes ──
  manejar(CANALES.clientesBuscar, 'sesion', z.tuple([esquemaBuscarClientes]), (filtro) => buscarClientes(db(), filtro));
  manejar(CANALES.clientesGuardar, 'sesion', z.tuple([esquemaCliente]), (datos) => guardarCliente(db(), datos));
  manejar(CANALES.clientesActivo, 'sesion', z.tuple([id, activo]), (cid, a) => {
    cambiarActivoCliente(db(), cid, a);
    return null;
  });

  // ── Reservas y pagos ──
  manejar(CANALES.reservasRango, 'sesion', z.tuple([esquemaRango]), (rango) => reservasDelRango(db(), rango));
  manejar(CANALES.reservasCrear, 'sesion', z.tuple([esquemaReserva]), (datos, yo) => crearReserva(db(), datos, new Date(), yo.id));
  manejar(CANALES.reservasEstado, 'sesion', z.tuple([id, esquemaEstado]), (rid, estado) => {
    cambiarEstado(db(), rid, estado);
    return null;
  });
  manejar(CANALES.reservasCancelar, 'sesion', z.tuple([esquemaCancelacion]), (datos) => {
    cancelarReserva(db(), datos);
    return null;
  });
  manejar(CANALES.pagosRegistrar, 'sesion', z.tuple([esquemaPago]), (datos, yo) => registrarPago(db(), datos, yo.id));
  manejar(CANALES.pagosAnular, 'sesion', z.tuple([id]), (pid, yo) => {
    anularPago(db(), pid, yo);
    return null;
  });

  // ── Complejo y sistema ──
  // El nombre del complejo se ve en la pantalla de ingreso: es 'libre'
  manejar(CANALES.complejoObtener, 'libre', nada, () => obtenerComplejo(db()));
  manejar(CANALES.complejoGuardar, 'admin', z.tuple([esquemaComplejo]), (datos) => {
    guardarComplejo(db(), datos);
    return null;
  });
  manejar(CANALES.sistemaInfo, 'sesion', nada, info);
  manejar(CANALES.sistemaResumen, 'sesion', nada, () => resumen(db()));
  manejar(CANALES.sistemaEjemplo, 'admin', nada, () => cargarEjemplo(db()));

  // ── Copias (solo administración) ──
  manejar(CANALES.copiasEstado, 'admin', nada, estadoCopias);
  manejar(CANALES.copiasExportar, 'admin', nada, exportarCopia);
  manejar(CANALES.copiasElegir, 'admin', nada, elegirCopia);
  manejar(CANALES.copiasRestaurar, 'admin', nada, restaurarCopiaElegida);
  manejar(CANALES.copiasAbrirCarpeta, 'admin', nada, abrirCarpetaCopias);
}
