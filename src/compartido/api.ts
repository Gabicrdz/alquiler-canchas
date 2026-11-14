// El contrato entre la ventana y el main: qué funciones existen, qué reciben
// y qué devuelven. El preload lo implementa; la ventana lo usa como window.canchas.
import type {
  DatosBuscarClientes,
  DatosCancelacion,
  DatosCancha,
  DatosCliente,
  DatosComplejo,
  DatosPago,
  DatosRango,
  DatosReserva,
  DatosUsuario,
} from './esquemas';
import type { EstadoReserva } from './canchas';
import type { Cancha, Cliente, Complejo, CopiaElegida, EstadoCopias, InfoCopia, InfoSistema, Reserva, Respuesta, ResultadoEjemplo, Resumen, Usuario } from './tipos';

export interface ApiCanchas {
  sesion: {
    /** Quién está usando el sistema (null = nadie: pantalla de ingreso). */
    actual(): Promise<Respuesta<Usuario | null>>;
    iniciar(usuarioId: number, pin: string): Promise<Respuesta<Usuario>>;
    cerrar(): Promise<Respuesta<null>>;
  };
  usuarios: {
    /** Para la pantalla de ingreso: solo nombre y rol. */
    paraIngresar(): Promise<Respuesta<Usuario[]>>;
    /** Solo la primera vez (sin usuarios): crea el de administración y entra. */
    crearPrimero(nombre: string, pin: string): Promise<Respuesta<Usuario>>;
    listar(): Promise<Respuesta<Usuario[]>>;
    guardar(datos: DatosUsuario): Promise<Respuesta<number>>;
    darDeBaja(id: number): Promise<Respuesta<null>>;
  };
  canchas: {
    listar(): Promise<Respuesta<Cancha[]>>;
    guardar(datos: DatosCancha): Promise<Respuesta<number>>;
    cambiarActivo(id: number, activo: boolean): Promise<Respuesta<null>>;
  };
  clientes: {
    buscar(filtro: DatosBuscarClientes): Promise<Respuesta<Cliente[]>>;
    guardar(datos: DatosCliente): Promise<Respuesta<number>>;
    cambiarActivo(id: number, activo: boolean): Promise<Respuesta<null>>;
  };
  reservas: {
    /** Las reservas de un rango de días (un día o una semana), sin las canceladas. */
    rango(rango: DatosRango): Promise<Respuesta<Reserva[]>>;
    crear(datos: DatosReserva): Promise<Respuesta<number>>;
    cambiarEstado(id: number, estado: EstadoReserva): Promise<Respuesta<null>>;
    cancelar(datos: DatosCancelacion): Promise<Respuesta<null>>;
  };
  pagos: {
    registrar(datos: DatosPago): Promise<Respuesta<number>>;
    anular(id: number): Promise<Respuesta<null>>;
  };
  complejo: {
    obtener(): Promise<Respuesta<Complejo>>;
    guardar(datos: DatosComplejo): Promise<Respuesta<null>>;
  };
  /** Copias de seguridad (solo administración). */
  copias: {
    estado(): Promise<Respuesta<EstadoCopias>>;
    exportar(): Promise<Respuesta<InfoCopia | null>>;
    elegir(): Promise<Respuesta<CopiaElegida | null>>;
    /** Restaura la copia elegida y reinicia el programa. */
    restaurar(): Promise<Respuesta<null>>;
    abrirCarpeta(): Promise<Respuesta<null>>;
  };
  sistema: {
    info(): Promise<Respuesta<InfoSistema>>;
    resumen(): Promise<Respuesta<Resumen>>;
    /** Carga canchas, clientes y reservas de ejemplo (solo si todavía no hay canchas). */
    cargarEjemplo(): Promise<Respuesta<ResultadoEjemplo>>;
  };
}

export const CANALES = {
  sesionActual: 'sesion:actual',
  sesionIniciar: 'sesion:iniciar',
  sesionCerrar: 'sesion:cerrar',
  usuariosParaIngresar: 'usuarios:para-ingresar',
  usuariosCrearPrimero: 'usuarios:crear-primero',
  usuariosListar: 'usuarios:listar',
  usuariosGuardar: 'usuarios:guardar',
  usuariosBaja: 'usuarios:baja',
  canchasListar: 'canchas:listar',
  canchasGuardar: 'canchas:guardar',
  canchasActivo: 'canchas:activo',
  clientesBuscar: 'clientes:buscar',
  clientesGuardar: 'clientes:guardar',
  clientesActivo: 'clientes:activo',
  reservasRango: 'reservas:rango',
  reservasCrear: 'reservas:crear',
  reservasEstado: 'reservas:estado',
  reservasCancelar: 'reservas:cancelar',
  pagosRegistrar: 'pagos:registrar',
  pagosAnular: 'pagos:anular',
  complejoObtener: 'complejo:obtener',
  complejoGuardar: 'complejo:guardar',
  sistemaInfo: 'sistema:info',
  sistemaResumen: 'sistema:resumen',
  sistemaEjemplo: 'sistema:ejemplo',
  copiasEstado: 'copias:estado',
  copiasExportar: 'copias:exportar',
  copiasElegir: 'copias:elegir',
  copiasRestaurar: 'copias:restaurar',
  copiasAbrirCarpeta: 'copias:abrir-carpeta',
} as const;
