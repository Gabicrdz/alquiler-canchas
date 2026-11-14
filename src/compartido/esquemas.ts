// Reglas de los datos que viajan de la ventana al proceso main.
// Zod las revisa en el main (nunca confiamos en lo que manda la ventana) y
// TypeScript saca de acá los tipos, así la ventana y el main hablan igual.
import { z } from 'zod';
import { aMinutos, esHora } from './horarios';
import { DEPORTES, ESTADOS, MOTIVOS_BLOQUEO, TIPOS_DE_DIA, esHoraFin } from './canchas';

export const id = z.number().int().positive();
const texto = (campo: string, maximo: number) =>
  z
    .string()
    .trim()
    .min(1, `Escribí ${campo}.`)
    .max(maximo, `${campo[0]?.toUpperCase()}${campo.slice(1)}: máximo ${maximo} caracteres.`);
const textoOpcional = (maximo: number) => z.string().trim().max(maximo, `Máximo ${maximo} caracteres.`).default('');

/** 'AAAA-MM-DD' que además sea una fecha REAL (SQLite no lo controla: '2026-02-31' pasaría). */
export const esquemaFecha = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha no es válida.')
  .refine((f) => {
    const [a, m, d] = f.split('-').map(Number) as [number, number, number];
    const fecha = new Date(a, m - 1, d);
    return fecha.getFullYear() === a && fecha.getMonth() === m - 1 && fecha.getDate() === d;
  }, 'Esa fecha no existe.');

export const esquemaHora = z.string().refine(esHora, 'La hora tiene que ser como 18:30.');
const esquemaHoraFin = z.string().refine(esHoraFin, 'La hora tiene que ser como 23:00 (o 24:00 si cierra a medianoche).');

const dinero = (maximo = 100_000_000) => z.number().int().min(0, 'El importe no puede ser negativo.').max(maximo, 'El importe es demasiado alto.');

// ---------- Canchas ----------
export const esquemaTarifa = z
  .object({
    dias: z.enum(TIPOS_DE_DIA),
    desde: esquemaHora,
    hasta: esquemaHoraFin,
    precioCentavos: dinero(),
  })
  .refine((t) => aMinutos(t.desde) < aMinutos(t.hasta), { message: 'En cada franja de precio, "desde" tiene que ser antes que "hasta".' });

export const esquemaCancha = z
  .object({
    id: id.optional(),
    nombre: texto('el nombre de la cancha', 30),
    deporte: z.enum(DEPORTES),
    detalle: textoOpcional(60),
    techada: z.boolean().default(false),
    duracionMin: z.number().int().min(30, 'Un turno dura al menos 30 minutos.').max(240, 'Un turno dura como máximo 4 horas.'),
    apertura: esquemaHora,
    cierre: esquemaHoraFin,
    precioBaseCentavos: dinero(),
    tarifas: z.array(esquemaTarifa).max(20, 'Demasiadas franjas de precio.').default([]),
  })
  .superRefine((c, ctx) => {
    if (aMinutos(c.apertura) + c.duracionMin > aMinutos(c.cierre)) {
      ctx.addIssue({ code: 'custom', message: 'Entre la apertura y el cierre tiene que entrar al menos un turno.', path: ['cierre'] });
    }
    // Dos franjas de precio del mismo tipo de día no se pueden pisar (si no, no se sabe cuál vale)
    for (const dias of TIPOS_DE_DIA) {
      const del = c.tarifas.filter((t) => t.dias === dias).sort((a, b) => aMinutos(a.desde) - aMinutos(b.desde));
      for (let i = 1; i < del.length; i++) {
        if (aMinutos(del[i]!.desde) < aMinutos(del[i - 1]!.hasta)) {
          ctx.addIssue({ code: 'custom', message: 'Hay dos franjas de precio que se pisan.', path: ['tarifas'] });
          return;
        }
      }
    }
  });
export type DatosCancha = z.input<typeof esquemaCancha>;

// ---------- Clientes ----------
export const esquemaCliente = z.object({
  id: id.optional(),
  nombre: texto('el nombre (o el del equipo)', 60),
  telefono: textoOpcional(30),
  notas: textoOpcional(300),
});
export type DatosCliente = z.input<typeof esquemaCliente>;

export const esquemaBuscarClientes = z.object({
  texto: z.string().trim().max(60).default(''),
  incluirBajas: z.boolean().default(false),
});
export type DatosBuscarClientes = z.input<typeof esquemaBuscarClientes>;

// ---------- Complejo ----------
export const esquemaComplejo = z.object({
  nombre: texto('el nombre del complejo', 50),
  direccion: textoOpcional(80),
  telefono: textoOpcional(40),
  /** Porcentaje del precio que se propone como seña (0 = no se pide seña). */
  senaPorcentaje: z.number().int().min(0, 'La seña no puede ser negativa.').max(100, 'La seña no puede pasar del 100 %.'),
});
export type DatosComplejo = z.input<typeof esquemaComplejo>;

// ---------- Pagos ----------
export const METODOS = ['efectivo', 'transferencia', 'mercadopago', 'tarjeta'] as const;
export const NOMBRE_METODO: Record<(typeof METODOS)[number], string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  mercadopago: 'Mercado Pago',
  tarjeta: 'Tarjeta',
};

export const esquemaPago = z.object({
  reservaId: id,
  montoCentavos: z.number().int().min(1, 'Escribí cuánto paga.').max(100_000_000, 'El importe es demasiado alto.'),
  metodo: z.enum(METODOS, { message: 'Elegí cómo paga.' }),
});
export type DatosPago = z.input<typeof esquemaPago>;

// ---------- Reservas ----------
export const esquemaEstado = z.enum(ESTADOS);

export const esquemaReserva = z.object({
  canchaId: id,
  clienteId: id,
  fecha: esquemaFecha,
  desde: esquemaHora,
  /** Si no viene, se usa el precio de la franja horaria de la cancha. */
  precioCentavos: dinero().optional(),
  nota: textoOpcional(120),
  /** Seña que se cobra en el momento (opcional). */
  senaCentavos: dinero().default(0),
  metodoSena: z.enum(METODOS).nullable().default(null),
})
  .superRefine((r, ctx) => {
    if (r.senaCentavos > 0 && r.metodoSena === null) ctx.addIssue({ code: 'custom', message: 'Elegí cómo paga la seña.', path: ['metodoSena'] });
    if (r.precioCentavos !== undefined && r.senaCentavos > r.precioCentavos) ctx.addIssue({ code: 'custom', message: 'La seña no puede ser más que el precio.', path: ['senaCentavos'] });
  })
  // Sin seña, el método no tiene sentido
  .transform((r) => ({ ...r, metodoSena: r.senaCentavos > 0 ? r.metodoSena : null }));
export type DatosReserva = z.input<typeof esquemaReserva>;

export const esquemaCancelacion = z.object({
  id,
  /** Qué pasa con lo que ya pagó: devolverlo (se anula) o quedárselo (cancelación tardía). */
  devolverSena: z.boolean(),
});
export type DatosCancelacion = z.input<typeof esquemaCancelacion>;

const MAXIMO_DIAS = 42;
/** Un rango de días para la grilla (un día o una semana). */
export const esquemaRango = z
  .object({ desde: esquemaFecha, hasta: esquemaFecha })
  .refine((r) => r.desde <= r.hasta, { message: '"Hasta" no puede ser antes que "desde".' })
  .refine((r) => (Date.parse(r.hasta) - Date.parse(r.desde)) / 86_400_000 < MAXIMO_DIAS, {
    message: `Se piden de a ${MAXIMO_DIAS} días como máximo.`,
  });
export type DatosRango = z.input<typeof esquemaRango>;

/** El rango de un reporte: hasta un año (los reportes suman, no dibujan la grilla). */
export const esquemaRangoReporte = z
  .object({ desde: esquemaFecha, hasta: esquemaFecha })
  .refine((r) => r.desde <= r.hasta, { message: '"Hasta" no puede ser antes que "desde".' })
  .refine((r) => (Date.parse(r.hasta) - Date.parse(r.desde)) / 86_400_000 < 366, { message: 'Los reportes son de un año como máximo.' });
export type DatosRangoReporte = z.input<typeof esquemaRangoReporte>;

/** Un aviso por WhatsApp sobre una reserva. */
export const esquemaAviso = z.object({ reservaId: id, tipo: z.enum(['recordatorio', 'cobro'], { message: 'Elegí el tipo de aviso.' }) });
export type DatosAviso = z.input<typeof esquemaAviso>;

// ---------- Usuarios ----------
export const ROLES = ['admin', 'encargado'] as const;

export const esquemaPin = z.string().regex(/^\d{4,6}$/, 'El PIN tiene que ser de 4 a 6 números.');

export const esquemaUsuario = z.object({
  id: id.optional(),
  nombre: texto('el nombre', 30),
  rol: z.enum(ROLES),
  /** Obligatorio al crear; al editar, vacío = no cambiar el PIN. */
  pin: z.union([esquemaPin, z.literal('')]).default(''),
});
export type DatosUsuario = z.input<typeof esquemaUsuario>;

// ---------- Mover una reserva ----------
export const esquemaMover = z.object({
  id,
  canchaId: id,
  fecha: esquemaFecha,
  desde: esquemaHora,
});
export type DatosMover = z.input<typeof esquemaMover>;

// ---------- Abonos (turno fijo todas las semanas) ----------
export const esquemaAbono = z
  .object({
    canchaId: id,
    clienteId: id,
    /** 1 = lunes … 7 = domingo. */
    diaSemana: z.number().int().min(1).max(7),
    desde: esquemaHora,
    desdeFecha: esquemaFecha,
    /** Sin fecha de fin = sigue hasta que se lo termine. */
    hastaFecha: esquemaFecha.nullable().default(null),
    /** El precio de cada turno del abono (puede tener descuento). */
    precioCentavos: dinero(),
    nota: textoOpcional(120),
  })
  .refine((a) => a.hastaFecha === null || a.hastaFecha >= a.desdeFecha, { message: '"Hasta" no puede ser antes que "desde".', path: ['hastaFecha'] });
export type DatosAbono = z.input<typeof esquemaAbono>;

export const esquemaTerminarAbono = z.object({
  id,
  /** Qué pasa con lo que ya pagaron los turnos futuros que se cancelan. */
  devolverSena: z.boolean(),
});
export type DatosTerminarAbono = z.input<typeof esquemaTerminarAbono>;

// ---------- Bloqueos (lluvia, mantenimiento…) ----------
export const esquemaBloqueo = z
  .object({
    /** null = todas las canchas. */
    canchaId: id.nullable(),
    fechaDesde: esquemaFecha,
    fechaHasta: esquemaFecha,
    /** Los dos null = todo el día. */
    desde: esquemaHora.nullable().default(null),
    hasta: esquemaHoraFin.nullable().default(null),
    motivo: z.enum(MOTIVOS_BLOQUEO, { message: 'Elegí el motivo.' }),
    nota: textoOpcional(120),
    /** Si hay reservas en ese horario: ¿se cancelan? (si no, el bloqueo no se crea) */
    cancelarReservas: z.boolean().default(false),
    /** Al cancelarlas, ¿se devuelve lo que ya pagaron? */
    devolverSena: z.boolean().default(true),
  })
  .refine((b) => b.fechaDesde <= b.fechaHasta, { message: '"Hasta" no puede ser antes que "desde".', path: ['fechaHasta'] })
  .refine((b) => (b.desde === null) === (b.hasta === null), { message: 'Elegí las dos horas, o ninguna para bloquear todo el día.', path: ['desde'] })
  .refine((b) => b.desde === null || b.hasta === null || aMinutos(b.desde) < aMinutos(b.hasta), { message: '"Desde" tiene que ser antes que "hasta".', path: ['desde'] });
export type DatosBloqueo = z.input<typeof esquemaBloqueo>;
