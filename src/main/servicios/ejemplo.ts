// Datos de ejemplo para probar el sistema o hacer una demo a un cliente:
// 3 canchas de fútbol, 2 de pádel, clientes y reservas de la semana pasada,
// esta semana y la que viene. Los precios cambian según la franja horaria.
import type { BaseDeDatos } from '../db/conexion';
import { esquemaCancha, esquemaCliente, type DatosCancha } from '@compartido/esquemas';
import { bloqueoCubre, horariosDeCancha, precioDelTurno, senaSugerida, sumarMinutos } from '@compartido/canchas';
import { fechasDeUnDia, sumarDias as sumarDiasTexto } from '@compartido/horarios';
import type { ResultadoEjemplo } from '@compartido/tipos';
import { crearAbono } from './abonos';
import { crearBloqueo } from './bloqueos';
import { guardarCancha, listarCanchas } from './canchas';
import { guardarCliente } from './clientes';
import { resumen } from './complejo';
import { ErrorDeUsuario } from './errores';
import { fechaLocal, horaLocal } from './fechas';
import { guardarUsuario, listarUsuarios } from './usuarios';

const $ = (pesos: number) => pesos * 100;

const CANCHAS: DatosCancha[] = [
  {
    nombre: 'Cancha 1',
    deporte: 'futbol',
    detalle: 'Fútbol 5 · césped sintético',
    techada: false,
    duracionMin: 60,
    apertura: '15:00',
    cierre: '24:00',
    precioBaseCentavos: $(22000),
    tarifas: [
      { dias: 'todos', desde: '15:00', hasta: '19:00', precioCentavos: $(22000) },
      { dias: 'todos', desde: '19:00', hasta: '24:00', precioCentavos: $(30000) },
    ],
  },
  {
    nombre: 'Cancha 2',
    deporte: 'futbol',
    detalle: 'Fútbol 5 · césped sintético',
    techada: false,
    duracionMin: 60,
    apertura: '15:00',
    cierre: '24:00',
    precioBaseCentavos: $(22000),
    tarifas: [
      { dias: 'todos', desde: '15:00', hasta: '19:00', precioCentavos: $(22000) },
      { dias: 'todos', desde: '19:00', hasta: '24:00', precioCentavos: $(30000) },
    ],
  },
  {
    nombre: 'Cancha 3',
    deporte: 'futbol',
    detalle: 'Fútbol 7 · techada',
    techada: true,
    duracionMin: 60,
    apertura: '15:00',
    cierre: '24:00',
    precioBaseCentavos: $(36000),
    tarifas: [
      { dias: 'semana', desde: '15:00', hasta: '19:00', precioCentavos: $(36000) },
      { dias: 'semana', desde: '19:00', hasta: '24:00', precioCentavos: $(46000) },
      { dias: 'finde', desde: '15:00', hasta: '24:00', precioCentavos: $(50000) },
    ],
  },
  {
    nombre: 'Pádel 1',
    deporte: 'padel',
    detalle: 'Pádel · cristal panorámico',
    techada: true,
    duracionMin: 90,
    apertura: '14:00',
    cierre: '23:00',
    precioBaseCentavos: $(18000),
    tarifas: [
      { dias: 'todos', desde: '14:00', hasta: '18:00', precioCentavos: $(18000) },
      { dias: 'todos', desde: '18:00', hasta: '23:00', precioCentavos: $(24000) },
    ],
  },
  {
    nombre: 'Pádel 2',
    deporte: 'padel',
    detalle: 'Pádel · cristal',
    techada: false,
    duracionMin: 90,
    apertura: '14:00',
    cierre: '23:00',
    precioBaseCentavos: $(16000),
    tarifas: [
      { dias: 'todos', desde: '14:00', hasta: '18:00', precioCentavos: $(16000) },
      { dias: 'todos', desde: '18:00', hasta: '23:00', precioCentavos: $(21000) },
    ],
  },
];

const CLIENTES = [
  ['Los Pibes del Barrio', '370 455-1020'],
  ['Matías Gómez', '370 466-2231'],
  ['Los Halcones FC', '370 477-8812'],
  ['Sofía Benítez', '370 412-3344'],
  ['Club Social Sur', '370 488-1190'],
  ['Nico y los Pibes', '370 433-9021'],
  ['Carolina Duarte', '370 455-7788'],
  ['Los Titanes', '370 401-5566'],
  ['Facu Romero', '370 499-0123'],
  ['Las Pumas Pádel', '370 422-6677'],
  ['Agustín Báez', '370 444-3210'],
  ['Los Galácticos', '370 411-8899'],
  ['Valentina Cabrera', '370 466-0045'],
  ['Pádel de los Jueves', '370 477-3322'],
] as const;

/** Números "al azar" que siempre dan lo mismo (la demo sale igual cada vez). */
function semilla(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

const sumarDias = (fecha: Date, dias: number) => new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() + dias, 12);

/**
 * Carga las canchas, los clientes y las reservas. Solo si todavía no hay
 * canchas (para no mezclarse con datos reales). Crea además un usuario
 * encargado, para probar los dos roles.
 */
export function cargarEjemplo(db: BaseDeDatos, ahora: Date = new Date()): ResultadoEjemplo {
  if (listarCanchas(db).length) throw new ErrorDeUsuario('Ya hay canchas cargadas: los datos de ejemplo se cargan solo en un sistema vacío.');

  const usuarios: ResultadoEjemplo['usuarios'] = [];
  const yo = listarUsuarios(db)[0];
  if (!listarUsuarios(db).some((u) => u.rol === 'encargado')) {
    guardarUsuario(db, { nombre: 'Lucas', rol: 'encargado', pin: '2222' });
    usuarios.push({ nombre: 'Lucas', rol: 'encargado', pin: '2222' });
  }

  db.$client.transaction(() => {
    for (const c of CANCHAS) guardarCancha(db, esquemaCancha.parse(c), ahora);
    const clienteIds = CLIENTES.map(([nombre, telefono]) => guardarCliente(db, esquemaCliente.parse({ nombre, telefono })));
    const canchas = listarCanchas(db);
    const hoy = fechaLocal(ahora);
    const horaAhora = horaLocal(ahora);
    const insertar = db.$client.prepare(
      `INSERT INTO reservas (cancha_id, cliente_id, fecha, desde, hasta, estado, precio_centavos, dado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const pagar = db.$client.prepare(`INSERT INTO pagos (reserva_id, monto_centavos, metodo, usuario_id, creado_en) VALUES (?, ?, ?, ?, ?)`);
    const metodos = ['efectivo', 'transferencia', 'mercadopago', 'efectivo', 'tarjeta'] as const;

    // Abonos (turnos fijos con un 10 % de descuento) y dos bloqueos: se cargan ANTES que las
    // reservas sueltas, que después esquivan esos horarios.
    const ABONOS = [
      ['Los Halcones FC', 'Cancha 2', 2, '21:00'],
      ['Club Social Sur', 'Cancha 1', 4, '22:00'],
      ['Pádel de los Jueves', 'Pádel 1', 4, '20:00'],
      ['Las Pumas Pádel', 'Pádel 2', 6, '18:30'],
    ] as const;
    for (const [nombreCliente, nombreCancha, dia, desde] of ABONOS) {
      const cancha = canchas.find((c) => c.nombre === nombreCancha)!;
      const cliente = clienteIds[CLIENTES.findIndex(([nombre]) => nombre === nombreCliente)]!;
      const fecha = fechasDeUnDia(dia, hoy, sumarDiasTexto(hoy, 7))[0]!;
      const precio = Math.round((precioDelTurno(cancha, fecha, desde) * 0.9) / 10_000) * 10_000;
      crearAbono(db, { canchaId: cancha.id, clienteId: cliente, diaSemana: dia, desde, desdeFecha: hoy, hastaFecha: null, precioCentavos: precio, nota: 'Abono' }, ahora, yo?.id ?? null);
    }
    const cancha1 = canchas.find((c) => c.nombre === 'Cancha 1')!;
    const cancha2 = canchas.find((c) => c.nombre === 'Cancha 2')!;
    const bloqueosEjemplo = [
      { canchaId: cancha1.id, fechaDesde: sumarDiasTexto(hoy, 2), fechaHasta: sumarDiasTexto(hoy, 2), desde: '15:00', hasta: '19:00', motivo: 'mantenimiento' as const, nota: 'pintura de líneas' },
      { canchaId: cancha2.id, fechaDesde: sumarDiasTexto(hoy, 4), fechaHasta: sumarDiasTexto(hoy, 4), desde: null, hasta: null, motivo: 'lluvia' as const, nota: '' },
    ];
    for (const b of bloqueosEjemplo) crearBloqueo(db, { ...b, cancelarReservas: true, devolverSena: true }, ahora);
    const ocupado = db.$client.prepare(
      `SELECT 1 FROM reservas WHERE cancha_id = ? AND fecha = ? AND estado <> 'cancelada' AND desde < ? AND ? < hasta`,
    );

    let n = 0;
    // Un mes atrás y dos semanas adelante: así los reportes de "últimos 30 días" tienen qué mostrar
    for (let d = -30; d <= 14; d++) {
      const dia = sumarDias(ahora, d);
      const fecha = fechaLocal(dia);
      const finde = dia.getDay() === 0 || dia.getDay() === 6;
      for (const cancha of canchas) {
        for (const desde of horariosDeCancha(cancha.apertura, cancha.cierre, cancha.duracionMin)) {
          n++;
          // De noche y los fines de semana se llena más; a la tarde, menos
          const noche = desde >= '19:00';
          const probabilidad = (noche ? 0.62 : 0.28) + (finde ? 0.22 : 0) - (d > 0 ? Math.min(0.25, 0.03 * d) : 0);
          if (semilla(n) > probabilidad) continue;
          const hasta = sumarMinutos(desde, cancha.duracionMin);
          if (bloqueosEjemplo.some((b) => bloqueoCubre(b, cancha.id, fecha, desde, hasta)) || ocupado.get(cancha.id, fecha, hasta, desde)) continue;
          const precio = precioDelTurno(cancha, fecha, desde);
          const cliente = clienteIds[Math.floor(semilla(n + 500) * clienteIds.length)]!;
          const pasada = fecha < hoy || (fecha === hoy && hasta <= horaAhora);
          const azar = semilla(n + 900);
          const estado = pasada ? (azar < 0.08 ? 'ausente' : 'jugada') : 'reservada';
          const reserva = Number(insertar.run(cancha.id, cliente, fecha, desde, hasta, estado, precio, yo?.id ?? null).lastInsertRowid);
          const metodo = metodos[Math.floor(semilla(n + 1300) * metodos.length)]!;
          // Los pagos llevan fecha de verdad (el día del partido, o la seña unos días antes):
          // si no, los reportes del ejemplo mostrarían todo cobrado "hoy".
          const cuando = (dia: string) => `${dia} 12:00:00`;
          if (estado === 'jugada') {
            // Casi todas pagas; algunas quedaron debiendo (para probar "Reclamar saldo")
            const debe = azar >= 0.08 && azar < 0.16 && fecha < hoy;
            pagar.run(reserva, debe ? senaSugerida(precio, 30) : precio, metodo, yo?.id ?? null, cuando(fecha));
          } else if (estado === 'ausente') pagar.run(reserva, senaSugerida(precio, 30), 'transferencia', yo?.id ?? null, cuando(sumarDiasTexto(fecha, -2)));
          else if (semilla(n + 1700) < 0.7) {
            // Las próximas, casi todas con seña; algunas pagas del todo
            pagar.run(reserva, azar < 0.2 ? precio : senaSugerida(precio, 30), metodo, yo?.id ?? null, cuando(sumarDiasTexto(hoy, -Math.floor(semilla(n + 2100) * 7))));
          }
        }
      }
    }
  })();
  return { ...resumen(db), usuarios };
}
