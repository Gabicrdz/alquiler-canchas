// El comprobante de una reserva, pensado para una impresora de tickets (angosto)
// pero que sale bien en cualquier impresora. No es una factura: es un papelito
// para el cliente con lo que reservó y lo que pagó.
import { NOMBRE_METODO } from '@compartido/esquemas';
import { pesos } from '@compartido/dinero';
import type { Cancha, Complejo, Reserva } from '@compartido/tipos';
import { fechaLarga } from '@/lib/fechas';

export function TicketReserva({ reserva, cancha, complejo }: { reserva: Reserva; cancha: Cancha | undefined; complejo: Complejo | undefined }) {
  const saldo = reserva.precioCentavos - reserva.pagadoCentavos;
  const linea = <div className="my-2 border-t border-dashed border-black" />;
  return (
    <div className="mx-auto w-[72mm] text-[12px] leading-snug" style={{ fontFamily: 'Figtree, sans-serif' }}>
      <p className="text-center text-[16px] font-bold">{complejo?.nombre ?? 'Complejo de canchas'}</p>
      {complejo?.direccion && <p className="text-center">{complejo.direccion}</p>}
      {complejo?.telefono && <p className="text-center">Tel. {complejo.telefono}</p>}
      {linea}
      <p className="text-center text-[13px] font-bold tracking-wide uppercase">Comprobante de reserva</p>
      {linea}
      <p className="text-[15px] font-bold">{reserva.cliente}</p>
      <p>
        {cancha?.nombre ?? 'Cancha'} · <span className="first-letter:uppercase">{fechaLarga(reserva.fecha)}</span>
      </p>
      <p className="text-[15px] font-bold">
        {reserva.desde} a {reserva.hasta} h
      </p>
      {linea}
      <div className="flex justify-between">
        <span>Precio del turno</span>
        <span className="font-bold">{pesos(reserva.precioCentavos)}</span>
      </div>
      {reserva.pagos.map((p) => (
        <div key={p.id} className="flex justify-between">
          <span>
            Pagó ({NOMBRE_METODO[p.metodo]}) {p.creadoEn.slice(8, 10)}/{p.creadoEn.slice(5, 7)}
          </span>
          <span>{pesos(p.montoCentavos)}</span>
        </div>
      ))}
      <div className="mt-1 flex justify-between text-[14px] font-bold">
        <span>{saldo > 0 ? 'Falta pagar' : 'Pagado'}</span>
        <span>{saldo > 0 ? pesos(saldo) : '✓ Completo'}</span>
      </div>
      {linea}
      <p className="text-center">Si no podés venir, avisanos con tiempo para liberar la cancha.</p>
      <p className="text-center font-bold">¡Gracias, los esperamos!</p>
      <p className="mt-2 text-center text-[10px]">Reserva Nº {reserva.id} · No es una factura</p>
    </div>
  );
}
