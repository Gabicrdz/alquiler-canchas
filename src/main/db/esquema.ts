// Las tablas, descriptas para Drizzle (consultas con tipos). La estructura
// REAL la crean las migraciones; una prueba revisa que ambas coincidan.
import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const ahora = sql`(datetime('now', 'localtime'))`;

export const configuracion = sqliteTable('configuracion', {
  clave: text('clave').primaryKey(),
  valor: text('valor').notNull(),
});

export const usuarios = sqliteTable('usuarios', {
  id: integer('id').primaryKey(),
  nombre: text('nombre').notNull(),
  rol: text('rol', { enum: ['admin', 'encargado'] }).notNull(),
  pinHash: text('pin_hash').notNull(),
  pinSal: text('pin_sal').notNull(),
  activo: integer('activo', { mode: 'boolean' }).notNull().default(true),
  creadoEn: text('creado_en').notNull().default(ahora),
});

export const canchas = sqliteTable('canchas', {
  id: integer('id').primaryKey(),
  nombre: text('nombre').notNull(),
  deporte: text('deporte', { enum: ['futbol', 'padel'] }).notNull(),
  detalle: text('detalle').notNull().default(''),
  techada: integer('techada', { mode: 'boolean' }).notNull().default(false),
  duracionMin: integer('duracion_min').notNull().default(60),
  apertura: text('apertura').notNull(),
  cierre: text('cierre').notNull(),
  precioBaseCentavos: integer('precio_base_centavos').notNull().default(0),
  activo: integer('activo', { mode: 'boolean' }).notNull().default(true),
  creadoEn: text('creado_en').notNull().default(ahora),
});

export const tarifas = sqliteTable('tarifas', {
  id: integer('id').primaryKey(),
  canchaId: integer('cancha_id')
    .notNull()
    .references(() => canchas.id, { onDelete: 'cascade' }),
  dias: text('dias', { enum: ['todos', 'semana', 'finde'] }).notNull(),
  desde: text('desde').notNull(),
  hasta: text('hasta').notNull(),
  precioCentavos: integer('precio_centavos').notNull(),
});

export const clientes = sqliteTable('clientes', {
  id: integer('id').primaryKey(),
  nombre: text('nombre').notNull(),
  telefono: text('telefono').notNull().default(''),
  notas: text('notas').notNull().default(''),
  busqueda: text('busqueda').notNull().default(''),
  activo: integer('activo', { mode: 'boolean' }).notNull().default(true),
  creadoEn: text('creado_en').notNull().default(ahora),
  actualizadoEn: text('actualizado_en').notNull().default(ahora),
});

export const reservas = sqliteTable('reservas', {
  id: integer('id').primaryKey(),
  canchaId: integer('cancha_id')
    .notNull()
    .references(() => canchas.id),
  clienteId: integer('cliente_id')
    .notNull()
    .references(() => clientes.id),
  fecha: text('fecha').notNull(),
  desde: text('desde').notNull(),
  hasta: text('hasta').notNull(),
  estado: text('estado', { enum: ['reservada', 'jugada', 'ausente', 'cancelada'] })
    .notNull()
    .default('reservada'),
  precioCentavos: integer('precio_centavos').notNull(),
  nota: text('nota').notNull().default(''),
  dadoPor: integer('dado_por').references(() => usuarios.id),
  creadoEn: text('creado_en').notNull().default(ahora),
  actualizadoEn: text('actualizado_en').notNull().default(ahora),
});

export const pagos = sqliteTable('pagos', {
  id: integer('id').primaryKey(),
  reservaId: integer('reserva_id')
    .notNull()
    .references(() => reservas.id),
  montoCentavos: integer('monto_centavos').notNull(),
  metodo: text('metodo', { enum: ['efectivo', 'transferencia', 'mercadopago', 'tarjeta'] }).notNull(),
  anulado: integer('anulado', { mode: 'boolean' }).notNull().default(false),
  anuladoEn: text('anulado_en'),
  usuarioId: integer('usuario_id').references(() => usuarios.id),
  creadoEn: text('creado_en').notNull().default(ahora),
});
