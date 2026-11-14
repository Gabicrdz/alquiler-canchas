// El contrato entre la ventana y el main: qué funciones existen, qué reciben
// y qué devuelven. El preload lo implementa; la ventana lo usa como window.canchas.
import type {
  DatosAbono,
  DatosAviso,
  DatosRangoReporte,
  DatosBloqueo,
  DatosBuscarClientes,
  DatosCancelacion,
  DatosCancha,
  DatosCliente,
  DatosEquipo,
  DatosFixture,
  DatosPagoEquipo,
  DatosProgramar,
  DatosResultado,
  DatosTorneo,
  DatosComplejo,
  DatosMover,
  DatosPago,
  DatosRango,
  DatosReserva,
  DatosTerminarAbono,
  DatosUsuario,
} from './esquemas';
import type { EstadoReserva } from './canchas';
import type { Abono, Bloqueo, Cancha, Cliente, Complejo, CopiaElegida, DetalleTorneo, Torneo, EstadoCopias, InfoCopia, InfoSistema, Reporte, Reserva, Respuesta, ResultadoAbono, ResultadoAviso, ResultadoBloqueo, ResultadoEjemplo, Resumen, Usuario } from './tipos';

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
    /** Cambia una reserva pendiente de cancha, día u hora (conserva el precio y los pagos). */
    mover(datos: DatosMover): Promise<Respuesta<null>>;
  };
  abonos: {
    listar(): Promise<Respuesta<Abono[]>>;
    crear(datos: DatosAbono): Promise<Respuesta<ResultadoAbono>>;
    /** Termina el abono y cancela sus turnos que todavía no se jugaron. Devuelve cuántos canceló. */
    terminar(datos: DatosTerminarAbono): Promise<Respuesta<number>>;
  };
  bloqueos: {
    /** Los vigentes y los que vienen (no los que ya pasaron). */
    listar(): Promise<Respuesta<Bloqueo[]>>;
    /** Los que tocan un rango de días (para pintar la grilla). */
    rango(rango: DatosRango): Promise<Respuesta<Bloqueo[]>>;
    /** Cuántas reservas se cancelarían si se crea este bloqueo. */
    afectadas(datos: DatosBloqueo): Promise<Respuesta<number>>;
    crear(datos: DatosBloqueo): Promise<Respuesta<ResultadoBloqueo>>;
    quitar(id: number): Promise<Respuesta<null>>;
  };
  reportes: {
    /** Ocupación, ingresos y deudores de un período (solo administración). */
    obtener(rango: DatosRangoReporte): Promise<Respuesta<Reporte>>;
  };
  whatsapp: {
    /** Abre WhatsApp con el mensaje escrito para el cliente de esa reserva. */
    avisar(datos: DatosAviso): Promise<Respuesta<ResultadoAviso>>;
  };
  torneos: {
    listar(): Promise<Respuesta<Torneo[]>>;
    obtener(id: number): Promise<Respuesta<DetalleTorneo>>;
    crear(datos: DatosTorneo): Promise<Respuesta<number>>;
    /** Lo da de baja y levanta el bloqueo de canchas que hubiera creado (solo administración). */
    cancelar(id: number): Promise<Respuesta<null>>;
    agregarEquipo(datos: DatosEquipo): Promise<Respuesta<number>>;
    quitarEquipo(equipoId: number): Promise<Respuesta<null>>;
    cobrarEquipo(datos: DatosPagoEquipo): Promise<Respuesta<number>>;
    anularPagoEquipo(pagoId: number): Promise<Respuesta<null>>;
    /** Arma el fixture (todos contra todos) y pasa el torneo a "en juego". */
    generarFixture(datos: DatosFixture): Promise<Respuesta<number>>;
    programarPartido(datos: DatosProgramar): Promise<Respuesta<null>>;
    cargarResultado(datos: DatosResultado): Promise<Respuesta<null>>;
    terminar(id: number): Promise<Respuesta<null>>;
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
  reservasMover: 'reservas:mover',
  abonosListar: 'abonos:listar',
  abonosCrear: 'abonos:crear',
  abonosTerminar: 'abonos:terminar',
  bloqueosListar: 'bloqueos:listar',
  bloqueosRango: 'bloqueos:rango',
  bloqueosAfectadas: 'bloqueos:afectadas',
  bloqueosCrear: 'bloqueos:crear',
  bloqueosQuitar: 'bloqueos:quitar',
  reportesObtener: 'reportes:obtener',
  whatsappAvisar: 'whatsapp:avisar',
  torneosListar: 'torneos:listar',
  torneosObtener: 'torneos:obtener',
  torneosCrear: 'torneos:crear',
  torneosCancelar: 'torneos:cancelar',
  torneosAgregarEquipo: 'torneos:agregar-equipo',
  torneosQuitarEquipo: 'torneos:quitar-equipo',
  torneosCobrarEquipo: 'torneos:cobrar-equipo',
  torneosAnularPago: 'torneos:anular-pago',
  torneosFixture: 'torneos:fixture',
  torneosProgramar: 'torneos:programar',
  torneosResultado: 'torneos:resultado',
  torneosTerminar: 'torneos:terminar',
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
