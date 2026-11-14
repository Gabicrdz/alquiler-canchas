import { describe, expect, it } from 'vitest';
import { esquemaBuscarClientes, esquemaCancha, esquemaCliente } from '../src/compartido/esquemas';
import { cambiarActivoCancha, guardarCancha, listarCanchas, obtenerCancha } from '../src/main/servicios/canchas';
import { buscarClientes, cambiarActivoCliente, guardarCliente } from '../src/main/servicios/clientes';
import { AHORA, MANANA, baseNueva, cancha, cliente, reservar } from './ayudantes';

const base = { nombre: 'Cancha 1', deporte: 'futbol', duracionMin: 60, apertura: '15:00', cierre: '24:00', precioBaseCentavos: 2_000_000 };

describe('canchas', () => {
  it('guarda la cancha con sus franjas de precio y las devuelve', () => {
    const db = baseNueva();
    const id = cancha(db, { tarifas: [{ dias: 'finde', desde: '15:00', hasta: '24:00', precioCentavos: 4_000_000 }], techada: true });
    const c = obtenerCancha(db, id);
    expect(c.techada).toBe(true);
    expect(c.tarifas).toEqual([{ dias: 'finde', desde: '15:00', hasta: '24:00', precioCentavos: 4_000_000 }]);
  });

  it('editar reemplaza las franjas, no las duplica', () => {
    const db = baseNueva();
    const id = cancha(db, { tarifas: [{ dias: 'todos', desde: '19:00', hasta: '24:00', precioCentavos: 3_000_000 }] });
    guardarCancha(db, esquemaCancha.parse({ ...base, id, tarifas: [{ dias: 'todos', desde: '20:00', hasta: '24:00', precioCentavos: 3_500_000 }] }), AHORA);
    expect(obtenerCancha(db, id).tarifas).toHaveLength(1);
    expect(obtenerCancha(db, id).tarifas[0]?.desde).toBe('20:00');
  });

  it('no repite el nombre (sin importar mayúsculas)', () => {
    const db = baseNueva();
    cancha(db, { nombre: 'Cancha 1' });
    expect(() => cancha(db, { nombre: 'CANCHA 1' })).toThrow('Ya hay una cancha que se llama');
  });

  it('valida el horario y las franjas', () => {
    expect(() => esquemaCancha.parse({ ...base, apertura: '23:30', cierre: '24:00' })).toThrow('al menos un turno');
    expect(() => esquemaCancha.parse({ ...base, duracionMin: 10 })).toThrow('al menos 30 minutos');
    expect(() => esquemaCancha.parse({ ...base, cierre: '25:00' })).toThrow('24:00');
    expect(() =>
      esquemaCancha.parse({
        ...base,
        tarifas: [
          { dias: 'todos', desde: '18:00', hasta: '21:00', precioCentavos: 1 },
          { dias: 'todos', desde: '20:00', hasta: '24:00', precioCentavos: 2 },
        ],
      }),
    ).toThrow('se pisan');
    // Una de semana y una de fin de semana a la misma hora sí pueden convivir
    esquemaCancha.parse({
      ...base,
      tarifas: [
        { dias: 'semana', desde: '18:00', hasta: '24:00', precioCentavos: 1 },
        { dias: 'finde', desde: '18:00', hasta: '24:00', precioCentavos: 2 },
      ],
    });
  });

  it('no deja cambiar el horario si una reserva pendiente ya no encajaría', () => {
    const db = baseNueva();
    const c = cancha(db);
    reservar(db, { canchaId: c, clienteId: cliente(db), desde: '20:00' });
    // De 90 en 90 desde las 15:00: 15:00, 16:30, 18:00, 19:30, 21:00… ya no hay turno a las 20:00
    expect(() => guardarCancha(db, esquemaCancha.parse({ ...base, id: c, duracionMin: 90 }), AHORA)).toThrow('no encajan');
    // Mover la apertura una hora no rompe nada: sigue habiendo turno a las 20
    guardarCancha(db, esquemaCancha.parse({ ...base, id: c, apertura: '16:00' }), AHORA);
  });

  it('no se da de baja con reservas pendientes; sin ellas, sí', () => {
    const db = baseNueva();
    const c = cancha(db);
    reservar(db, { canchaId: c, clienteId: cliente(db), fecha: MANANA });
    expect(() => cambiarActivoCancha(db, c, false, AHORA)).toThrow('1 reserva pendiente');
    const vacia = cancha(db, { nombre: 'Cancha 2' });
    cambiarActivoCancha(db, vacia, false, AHORA);
    expect(listarCanchas(db).map((x) => x.activo)).toEqual([true, false]);
  });
});

describe('clientes', () => {
  it('busca sin importar tildes, mayúsculas ni el orden de las palabras', () => {
    const db = baseNueva();
    cliente(db, { nombre: 'Matías Gómez', telefono: '370 466-2231' });
    cliente(db, { nombre: 'Los Halcones FC', telefono: '370 477-8812' });
    const buscar = (texto: string) => buscarClientes(db, esquemaBuscarClientes.parse({ texto })).map((c) => c.nombre);
    expect(buscar('matias')).toEqual(['Matías Gómez']);
    expect(buscar('gomez matias')).toEqual(['Matías Gómez']);
    expect(buscar('477')).toEqual(['Los Halcones FC']);
    expect(buscar('')).toHaveLength(2);
    expect(buscar('100%')).toHaveLength(0); // el % no es un comodín
  });

  it('cuenta las reservas que no se cancelaron', () => {
    const db = baseNueva();
    const k = cliente(db);
    reservar(db, { canchaId: cancha(db), clienteId: k });
    expect(buscarClientes(db, esquemaBuscarClientes.parse({}))[0]?.reservas).toBe(1);
  });

  it('editar actualiza la búsqueda; un cliente que no existe falla', () => {
    const db = baseNueva();
    const k = cliente(db, { nombre: 'Los Pibes' });
    guardarCliente(db, esquemaCliente.parse({ id: k, nombre: 'Los Cracks' }));
    expect(buscarClientes(db, esquemaBuscarClientes.parse({ texto: 'cracks' }))).toHaveLength(1);
    expect(buscarClientes(db, esquemaBuscarClientes.parse({ texto: 'pibes' }))).toHaveLength(0);
    expect(() => guardarCliente(db, esquemaCliente.parse({ id: 999, nombre: 'X' }))).toThrow('ya no existe');
  });

  it('con reservas pendientes no se da de baja; las bajas se esconden de la búsqueda', () => {
    const db = baseNueva();
    const k = cliente(db);
    const sin = cliente(db, { nombre: 'Otro' });
    reservar(db, { canchaId: cancha(db), clienteId: k, fecha: MANANA });
    expect(() => cambiarActivoCliente(db, k, false, AHORA)).toThrow('1 reserva pendiente');
    cambiarActivoCliente(db, sin, false, AHORA);
    expect(buscarClientes(db, esquemaBuscarClientes.parse({}))).toHaveLength(1);
    expect(buscarClientes(db, esquemaBuscarClientes.parse({ incluirBajas: true }))).toHaveLength(2);
  });
});
