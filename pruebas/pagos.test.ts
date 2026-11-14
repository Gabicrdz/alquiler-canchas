import { describe, expect, it } from 'vitest';
import { esquemaCancelacion, esquemaPago } from '../src/compartido/esquemas';
import { cancelarReserva, obtenerReserva } from '../src/main/servicios/reservas';
import { anularPago, registrarPago } from '../src/main/servicios/pagos';
import { AHORA, baseNueva, cancha, cliente, reservar, usuario } from './ayudantes';

function preparar() {
  const db = baseNueva();
  const u = usuario(db);
  const r = reservar(db, { canchaId: cancha(db), clienteId: cliente(db), desde: '20:00' }, u); // $ 20.000
  const pagar = (monto: number, metodo = 'efectivo') => registrarPago(db, esquemaPago.parse({ reservaId: r, montoCentavos: monto, metodo }), u, AHORA);
  return { db, u, r, pagar };
}

describe('pagos', () => {
  it('seña y saldo: pasa de sin pago a seña y a saldada', () => {
    const { db, r, pagar } = preparar();
    expect(obtenerReserva(db, r).estadoDePago).toBe('sin_pago');
    pagar(600_000);
    expect(obtenerReserva(db, r).estadoDePago).toBe('sena');
    pagar(1_400_000, 'mercadopago');
    const final = obtenerReserva(db, r);
    expect(final.estadoDePago).toBe('saldado');
    expect(final.pagos).toHaveLength(2);
    expect(final.pagos[1]?.usuario).toBe('Ana');
  });

  it('no se puede cobrar más de lo que falta', () => {
    const { pagar } = preparar();
    pagar(1_900_000);
    expect(() => pagar(200_000)).toThrow('Solo falta cobrar $ 1.000.');
  });

  it('una reserva paga del todo no acepta más pagos', () => {
    const { pagar } = preparar();
    pagar(2_000_000);
    expect(() => pagar(100)).toThrow('ya está paga');
  });

  it('el pago necesita importe y método', () => {
    expect(() => esquemaPago.parse({ reservaId: 1, montoCentavos: 0, metodo: 'efectivo' })).toThrow('Escribí cuánto paga.');
    expect(() => esquemaPago.parse({ reservaId: 1, montoCentavos: 100 })).toThrow('Elegí cómo paga.');
  });

  it('a una cancelada no se le cargan pagos', () => {
    const { db, r, pagar } = preparar();
    cancelarReserva(db, esquemaCancelacion.parse({ id: r, devolverSena: false }), AHORA);
    expect(() => pagar(100)).toThrow('ya no se le pueden cargar pagos');
  });
});

describe('anular pagos', () => {
  it('el encargado anula un pago de hoy; uno de otro día solo lo anula administración', () => {
    const { db, r, pagar } = preparar();
    const hoy = pagar(500_000);
    const viejo = pagar(500_000);
    db.$client.prepare(`UPDATE pagos SET creado_en = '2026-11-09 18:00:00' WHERE id = ?`).run(viejo);
    anularPago(db, hoy, { rol: 'encargado' }, AHORA);
    expect(() => anularPago(db, viejo, { rol: 'encargado' }, AHORA)).toThrow('solo administración');
    anularPago(db, viejo, { rol: 'admin' }, AHORA);
    expect(obtenerReserva(db, r).pagadoCentavos).toBe(0);
  });

  it('un pago anulado no se anula dos veces y libera el saldo', () => {
    const { db, r, pagar } = preparar();
    const p = pagar(2_000_000);
    anularPago(db, p, { rol: 'admin' }, AHORA);
    expect(() => anularPago(db, p, { rol: 'admin' }, AHORA)).toThrow('ya estaba anulado');
    expect(obtenerReserva(db, r).estadoDePago).toBe('sin_pago');
    expect(() => pagar(2_000_000)).not.toThrow();
  });
});
