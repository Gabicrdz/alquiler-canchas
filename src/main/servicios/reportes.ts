// Reportes para la administración: ocupación, ingresos, deudores.
// Todo se calcula acá, en el main, con consultas a la base; la ventana solo dibuja.
//
// Dos reglas para que los números cierren:
//  - INGRESOS = plata que entró (pagos no anulados) según el día del COBRO.
//    Una seña de hoy por un turno de la semana que viene cuenta hoy.
//  - OCUPACIÓN = turnos tomados (sin cancelar) ÷ turnos que las canchas activas
//    ofrecían, sin contar los que estaban bloqueados (lluvia, mantenimiento).
import type { z } from 'zod';
import type { BaseDeDatos } from '../db/conexion';
import type { esquemaRangoReporte } from '@compartido/esquemas';
import { bloqueoCubre, horariosDeCancha, sumarMinutos, type BloqueoBasico } from '@compartido/canchas';
import { diaDeLaSemana, sumarDias } from '@compartido/horarios';
import type { MetodoPago, Reporte } from '@compartido/tipos';
import { bloqueosDelRango } from './bloqueos';

interface FilaReserva {
  id: number;
  canchaId: number;
  clienteId: number;
  cliente: string;
  telefono: string;
  fecha: string;
  desde: string;
  estado: string;
  precio: number;
  pagado: number;
}

const horaEnPunto = (desde: string) => `${desde.slice(0, 2)}:00`;

export function obtenerReporte(db: BaseDeDatos, rango: z.output<typeof esquemaRangoReporte>): Reporte {
  const { desde, hasta } = rango;
  const sql = db.$client;

  const canchas = sql.prepare('SELECT id, nombre, deporte, duracion_min AS duracionMin, apertura, cierre, activo FROM canchas ORDER BY deporte DESC, nombre').all() as {
    id: number;
    nombre: string;
    deporte: string;
    duracionMin: number;
    apertura: string;
    cierre: string;
    activo: number;
  }[];

  const reservas = sql
    .prepare(
      `SELECT r.id, r.cancha_id AS canchaId, r.cliente_id AS clienteId, c.nombre AS cliente, c.telefono, r.fecha, r.desde, r.estado,
              r.precio_centavos AS precio,
              COALESCE((SELECT SUM(p.monto_centavos) FROM pagos p WHERE p.reserva_id = r.id AND p.anulado = 0), 0) AS pagado
         FROM reservas r JOIN clientes c ON c.id = r.cliente_id
        WHERE r.fecha BETWEEN ? AND ?`,
    )
    .all(desde, hasta) as FilaReserva[];

  const pagos = sql
    .prepare(
      `SELECT p.metodo, p.monto_centavos AS monto, r.cancha_id AS canchaId, substr(p.creado_en, 1, 10) AS fecha
         FROM pagos p JOIN reservas r ON r.id = p.reserva_id
        WHERE p.anulado = 0 AND substr(p.creado_en, 1, 10) BETWEEN ? AND ?`,
    )
    .all(desde, hasta) as { metodo: MetodoPago; monto: number; canchaId: number; fecha: string }[];

  const bloqueos = bloqueosDelRango(db, { desde, hasta }) as unknown as BloqueoBasico[];

  // ---- Turnos disponibles, por cancha y por franja (día de la semana × hora) ----
  const dias: string[] = [];
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) dias.push(f);

  const disponiblesPorCancha = new Map<number, number>();
  const mapa = new Map<string, { dia: number; hora: string; ocupados: number; disponibles: number }>();
  const celda = (dia: number, hora: string) => {
    const clave = `${dia}|${hora}`;
    let c = mapa.get(clave);
    if (!c) mapa.set(clave, (c = { dia, hora, ocupados: 0, disponibles: 0 }));
    return c;
  };

  const activas = canchas.filter((c) => c.activo === 1);
  for (const c of activas) {
    const inicios = horariosDeCancha(c.apertura, c.cierre, c.duracionMin);
    let total = 0;
    for (const fecha of dias) {
      const dia = diaDeLaSemana(fecha);
      for (const inicio of inicios) {
        const fin = sumarMinutos(inicio, c.duracionMin);
        if (bloqueos.some((b) => bloqueoCubre(b, c.id, fecha, inicio, fin))) continue;
        total++;
        celda(dia, horaEnPunto(inicio)).disponibles++;
      }
    }
    disponiblesPorCancha.set(c.id, total);
  }

  // ---- Reservas ----
  const tomadas = reservas.filter((r) => r.estado !== 'cancelada');
  const idsActivas = new Set(activas.map((c) => c.id));
  for (const r of tomadas) if (idsActivas.has(r.canchaId)) celda(diaDeLaSemana(r.fecha), horaEnPunto(r.desde)).ocupados++;

  const turnosDisponibles = [...disponiblesPorCancha.values()].reduce((s, n) => s + n, 0);
  const turnosOcupados = tomadas.filter((r) => idsActivas.has(r.canchaId)).length;
  const cuenta = (estado: string) => reservas.filter((r) => r.estado === estado).length;

  const jugadasConSaldo = reservas.filter((r) => r.estado === 'jugada' && r.precio - r.pagado > 0);

  // ---- Ingresos ----
  const cobradoCentavos = pagos.reduce((s, p) => s + p.monto, 0);
  const porMetodo = (['efectivo', 'transferencia', 'mercadopago', 'tarjeta'] as MetodoPago[]).map((metodo) => {
    const mios = pagos.filter((p) => p.metodo === metodo);
    return { metodo, centavos: mios.reduce((s, p) => s + p.monto, 0), cobros: mios.length };
  });

  const porDia = dias.map((fecha) => ({
    fecha,
    cobradoCentavos: pagos.filter((p) => p.fecha === fecha).reduce((s, p) => s + p.monto, 0),
    reservas: tomadas.filter((r) => r.fecha === fecha).length,
  }));

  const porCancha = canchas
    .map((c) => {
      const mias = tomadas.filter((r) => r.canchaId === c.id);
      const disponibles = disponiblesPorCancha.get(c.id) ?? 0;
      return {
        canchaId: c.id,
        nombre: c.nombre,
        deporte: c.deporte,
        reservas: mias.length,
        turnosDisponibles: disponibles,
        ocupacion: disponibles ? mias.length / disponibles : 0,
        cobradoCentavos: pagos.filter((p) => p.canchaId === c.id).reduce((s, p) => s + p.monto, 0),
      };
    })
    .filter((c) => c.turnosDisponibles > 0 || c.reservas > 0 || c.cobradoCentavos > 0);

  // ---- Clientes ----
  const porCliente = new Map<number, { clienteId: number; nombre: string; reservas: number; gastoCentavos: number }>();
  for (const r of tomadas) {
    const c = porCliente.get(r.clienteId) ?? { clienteId: r.clienteId, nombre: r.cliente, reservas: 0, gastoCentavos: 0 };
    c.reservas++;
    c.gastoCentavos += r.pagado;
    porCliente.set(r.clienteId, c);
  }
  const topClientes = [...porCliente.values()].sort((a, b) => b.reservas - a.reservas || b.gastoCentavos - a.gastoCentavos || a.nombre.localeCompare(b.nombre)).slice(0, 8);

  const nombreCancha = new Map(canchas.map((c) => [c.id, c.nombre]));
  const deudores = jugadasConSaldo
    .map((r) => ({
      reservaId: r.id,
      clienteId: r.clienteId,
      cliente: r.cliente,
      telefono: r.telefono,
      cancha: nombreCancha.get(r.canchaId) ?? '',
      fecha: r.fecha,
      desde: r.desde,
      saldoCentavos: r.precio - r.pagado,
    }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.desde.localeCompare(b.desde))
    .slice(0, 100);

  return {
    desde,
    hasta,
    resumen: {
      reservas: tomadas.length,
      jugadas: cuenta('jugada'),
      ausentes: cuenta('ausente'),
      pendientes: cuenta('reservada'),
      canceladas: cuenta('cancelada'),
      turnosDisponibles,
      turnosOcupados,
      ocupacion: turnosDisponibles ? turnosOcupados / turnosDisponibles : 0,
      cobradoCentavos,
      porCobrarCentavos: jugadasConSaldo.reduce((s, r) => s + (r.precio - r.pagado), 0),
    },
    porMetodo,
    porCancha,
    porDia,
    mapa: [...mapa.values()].sort((a, b) => a.dia - b.dia || a.hora.localeCompare(b.hora)),
    topClientes,
    deudores,
  };
}
