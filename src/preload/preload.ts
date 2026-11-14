// PRELOAD: el único puente entre la ventana y el main. Expone `window.canchas`
// con funciones concretas; la ventana nunca tiene acceso a ipcRenderer.
import { contextBridge, ipcRenderer } from 'electron';
import { CANALES, type ApiCanchas } from '@compartido/api';

const pedir = (canal: string, ...args: unknown[]) => ipcRenderer.invoke(canal, ...args);

const api: ApiCanchas = {
  sesion: {
    actual: () => pedir(CANALES.sesionActual),
    iniciar: (usuarioId, pin) => pedir(CANALES.sesionIniciar, usuarioId, pin),
    cerrar: () => pedir(CANALES.sesionCerrar),
  },
  usuarios: {
    paraIngresar: () => pedir(CANALES.usuariosParaIngresar),
    crearPrimero: (nombre, pin) => pedir(CANALES.usuariosCrearPrimero, nombre, pin),
    listar: () => pedir(CANALES.usuariosListar),
    guardar: (datos) => pedir(CANALES.usuariosGuardar, datos),
    darDeBaja: (id) => pedir(CANALES.usuariosBaja, id),
  },
  canchas: {
    listar: () => pedir(CANALES.canchasListar),
    guardar: (datos) => pedir(CANALES.canchasGuardar, datos),
    cambiarActivo: (id, activo) => pedir(CANALES.canchasActivo, id, activo),
  },
  clientes: {
    buscar: (filtro) => pedir(CANALES.clientesBuscar, filtro),
    guardar: (datos) => pedir(CANALES.clientesGuardar, datos),
    cambiarActivo: (id, activo) => pedir(CANALES.clientesActivo, id, activo),
  },
  reservas: {
    rango: (rango) => pedir(CANALES.reservasRango, rango),
    crear: (datos) => pedir(CANALES.reservasCrear, datos),
    cambiarEstado: (id, estado) => pedir(CANALES.reservasEstado, id, estado),
    cancelar: (datos) => pedir(CANALES.reservasCancelar, datos),
    mover: (datos) => pedir(CANALES.reservasMover, datos),
  },
  abonos: {
    listar: () => pedir(CANALES.abonosListar),
    crear: (datos) => pedir(CANALES.abonosCrear, datos),
    terminar: (datos) => pedir(CANALES.abonosTerminar, datos),
  },
  bloqueos: {
    listar: () => pedir(CANALES.bloqueosListar),
    rango: (rango) => pedir(CANALES.bloqueosRango, rango),
    afectadas: (datos) => pedir(CANALES.bloqueosAfectadas, datos),
    crear: (datos) => pedir(CANALES.bloqueosCrear, datos),
    quitar: (id) => pedir(CANALES.bloqueosQuitar, id),
  },
  pagos: {
    registrar: (datos) => pedir(CANALES.pagosRegistrar, datos),
    anular: (id) => pedir(CANALES.pagosAnular, id),
  },
  complejo: {
    obtener: () => pedir(CANALES.complejoObtener),
    guardar: (datos) => pedir(CANALES.complejoGuardar, datos),
  },
  copias: {
    estado: () => pedir(CANALES.copiasEstado),
    exportar: () => pedir(CANALES.copiasExportar),
    elegir: () => pedir(CANALES.copiasElegir),
    restaurar: () => pedir(CANALES.copiasRestaurar),
    abrirCarpeta: () => pedir(CANALES.copiasAbrirCarpeta),
  },
  sistema: {
    info: () => pedir(CANALES.sistemaInfo),
    resumen: () => pedir(CANALES.sistemaResumen),
    cargarEjemplo: () => pedir(CANALES.sistemaEjemplo),
  },
};

contextBridge.exposeInMainWorld('canchas', api);
