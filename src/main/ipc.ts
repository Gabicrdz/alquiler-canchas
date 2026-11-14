// Conecta los pedidos de la ventana (ipcRenderer.invoke) con los servicios.
// Cada canal:
//   1. revisa QUIÉN pide (sesión y rol). Los permisos se controlan ACÁ, en el
//      main: esconder un botón en la ventana no alcanza, porque la ventana
//      podría pedir cualquier cosa;
//   2. valida lo que llega con Zod ANTES de tocar la base de datos.
import { ipcMain, shell } from 'electron';
import { z, type ZodType } from 'zod';
import { CANALES } from '@compartido/api';
import {
  esquemaBuscarClientes,
  esquemaCancelacion,
  esquemaCancha,
  esquemaCliente,
  esquemaComplejo,
  esquemaAbono,
  esquemaAviso,
  esquemaEquipo,
  esquemaFixture,
  esquemaPagoEquipo,
  esquemaProgramar,
  esquemaResultado,
  esquemaTorneo,
  esquemaRangoReporte,
  esquemaBloqueo,
  esquemaEstado,
  esquemaMover,
  esquemaTerminarAbono,
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
import { cancelarReserva, cambiarEstado, crearReserva, moverReserva, reservasDelRango } from './servicios/reservas';
import { fechaLocal } from './servicios/fechas';
import { crearAbono, extenderAbonos, listarAbonos, terminarAbono } from './servicios/abonos';
import { bloqueosDelRango, contarAfectadas, crearBloqueo, listarBloqueos, quitarBloqueo } from './servicios/bloqueos';
import {
  agregarEquipo,
  anularPagoEquipo,
  cancelarTorneo,
  cargarResultado,
  cobrarEquipo,
  crearTorneo,
  generarFixture,
  listarTorneos,
  obtenerTorneo,
  programarPartido,
  quitarEquipo,
  terminarTorneo,
} from './servicios/torneos';
import { obtenerReporte } from './servicios/reportes';
import { prepararAviso } from './servicios/whatsapp';
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
  // Los abonos cargan sus turnos con 8 semanas de anticipación: se revisa una vez por día
  let diaRevisado = '';
  const mantenerAbonos = () => {
    const hoy = fechaLocal(new Date());
    if (hoy === diaRevisado) return;
    extenderAbonos(db());
    diaRevisado = hoy;
  };

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
  manejar(CANALES.reservasRango, 'sesion', z.tuple([esquemaRango]), (rango) => {
    mantenerAbonos();
    return reservasDelRango(db(), rango);
  });
  manejar(CANALES.reservasCrear, 'sesion', z.tuple([esquemaReserva]), (datos, yo) => crearReserva(db(), datos, new Date(), yo.id));
  manejar(CANALES.reservasEstado, 'sesion', z.tuple([id, esquemaEstado]), (rid, estado) => {
    cambiarEstado(db(), rid, estado);
    return null;
  });
  manejar(CANALES.reservasCancelar, 'sesion', z.tuple([esquemaCancelacion]), (datos) => {
    cancelarReserva(db(), datos);
    return null;
  });
  manejar(CANALES.reservasMover, 'sesion', z.tuple([esquemaMover]), (datos) => {
    moverReserva(db(), datos);
    return null;
  });

  // ── Abonos y bloqueos ──
  manejar(CANALES.abonosListar, 'sesion', nada, () => {
    mantenerAbonos();
    return listarAbonos(db());
  });
  manejar(CANALES.abonosCrear, 'sesion', z.tuple([esquemaAbono]), (datos, yo) => crearAbono(db(), datos, new Date(), yo.id));
  manejar(CANALES.abonosTerminar, 'admin', z.tuple([esquemaTerminarAbono]), (datos) => terminarAbono(db(), datos));
  manejar(CANALES.bloqueosListar, 'sesion', nada, () => listarBloqueos(db()));
  manejar(CANALES.bloqueosRango, 'sesion', z.tuple([esquemaRango]), (rango) => bloqueosDelRango(db(), rango));
  manejar(CANALES.bloqueosAfectadas, 'sesion', z.tuple([esquemaBloqueo]), (datos) => contarAfectadas(db(), datos));
  manejar(CANALES.bloqueosCrear, 'sesion', z.tuple([esquemaBloqueo]), (datos) => crearBloqueo(db(), datos));
  manejar(CANALES.bloqueosQuitar, 'sesion', z.tuple([id]), (bid) => {
    quitarBloqueo(db(), bid);
    return null;
  });

  // ── Reportes (solo administración) y WhatsApp ──
  manejar(CANALES.reportesObtener, 'admin', z.tuple([esquemaRangoReporte]), (rango) => obtenerReporte(db(), rango));
  manejar(CANALES.whatsappAvisar, 'sesion', z.tuple([esquemaAviso]), async (datos) => {
    const { url, telefono, cliente } = prepararAviso(db(), datos);
    await shell.openExternal(url); // solo https://wa.me/…: la ventana nunca elige la dirección
    return { telefono, cliente };
  });

  // ── Torneos ──
  manejar(CANALES.torneosListar, 'sesion', nada, () => listarTorneos(db()));
  manejar(CANALES.torneosObtener, 'sesion', z.tuple([id]), (tid) => obtenerTorneo(db(), tid));
  manejar(CANALES.torneosCrear, 'sesion', z.tuple([esquemaTorneo]), (datos) => crearTorneo(db(), datos));
  manejar(CANALES.torneosCancelar, 'admin', z.tuple([id]), (tid) => {
    cancelarTorneo(db(), tid);
    return null;
  });
  manejar(CANALES.torneosAgregarEquipo, 'sesion', z.tuple([esquemaEquipo]), (datos) => agregarEquipo(db(), datos));
  manejar(CANALES.torneosQuitarEquipo, 'sesion', z.tuple([id]), (eid) => {
    quitarEquipo(db(), eid);
    return null;
  });
  manejar(CANALES.torneosCobrarEquipo, 'sesion', z.tuple([esquemaPagoEquipo]), (datos, yo) => cobrarEquipo(db(), datos, yo.id));
  manejar(CANALES.torneosAnularPago, 'sesion', z.tuple([id]), (pid, yo) => {
    anularPagoEquipo(db(), pid, yo);
    return null;
  });
  manejar(CANALES.torneosFixture, 'sesion', z.tuple([esquemaFixture]), (datos) => generarFixture(db(), datos));
  manejar(CANALES.torneosProgramar, 'sesion', z.tuple([esquemaProgramar]), (datos) => {
    programarPartido(db(), datos);
    return null;
  });
  manejar(CANALES.torneosResultado, 'sesion', z.tuple([esquemaResultado]), (datos) => {
    cargarResultado(db(), datos);
    return null;
  });
  manejar(CANALES.torneosTerminar, 'sesion', z.tuple([id]), (tid) => {
    terminarTorneo(db(), tid);
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
