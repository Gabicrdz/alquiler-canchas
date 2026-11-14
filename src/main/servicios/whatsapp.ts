// Avisos por WhatsApp. Este servicio solo ARMA el enlace (y se prueba sin
// Electron); quien lo abre es ipc.ts con shell.openExternal.
import type { z } from 'zod';
import type { BaseDeDatos } from '../db/conexion';
import type { esquemaAviso } from '@compartido/esquemas';
import { armarMensaje, enlaceDeWhatsApp, telefonoParaWhatsApp } from '@compartido/mensajes';
import { ErrorDeUsuario } from './errores';
import { obtenerComplejo } from './complejo';
import { obtenerReserva } from './reservas';

export function prepararAviso(db: BaseDeDatos, datos: z.output<typeof esquemaAviso>): { url: string; telefono: string; cliente: string } {
  const r = obtenerReserva(db, datos.reservaId);
  const telefono = telefonoParaWhatsApp(r.telefono);
  if (!telefono) throw new ErrorDeUsuario(r.telefono ? `El teléfono de ${r.cliente} (${r.telefono}) no parece un celular. Corregilo en Clientes.` : `${r.cliente} no tiene teléfono cargado. Agregalo en Clientes.`);

  const saldo = r.precioCentavos - r.pagadoCentavos;
  if (datos.tipo === 'recordatorio' && r.estado !== 'reservada') throw new ErrorDeUsuario('Solo se recuerdan los turnos pendientes.');
  if (datos.tipo === 'cobro' && (r.estado === 'cancelada' || saldo <= 0)) throw new ErrorDeUsuario('Esa reserva no tiene saldo para reclamar.');

  const texto = armarMensaje(datos.tipo, {
    complejo: obtenerComplejo(db).nombre,
    cliente: r.cliente,
    cancha: db.$client.prepare('SELECT nombre FROM canchas WHERE id = ?').pluck().get(r.canchaId) as string,
    fecha: r.fecha,
    desde: r.desde,
    saldoCentavos: saldo,
  });
  return { url: enlaceDeWhatsApp(telefono, texto), telefono, cliente: r.cliente };
}
