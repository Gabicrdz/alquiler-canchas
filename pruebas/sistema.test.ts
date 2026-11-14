import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { esquemaCancelacion, esquemaComplejo, esquemaUsuario } from '../src/compartido/esquemas';
import { cargarEjemplo } from '../src/main/servicios/ejemplo';
import { listarCanchas } from '../src/main/servicios/canchas';
import { guardarComplejo, obtenerComplejo, resumen } from '../src/main/servicios/complejo';
import { reservasDelRango } from '../src/main/servicios/reservas';
import { cerrarSesion, iniciarSesion, reiniciarSesionParaPruebas, requerir } from '../src/main/servicios/sesion';
import { darDeBajaUsuario, guardarUsuario, listarUsuarios } from '../src/main/servicios/usuarios';
import { copiaAutomatica, copiasAutomaticas, descripcionDeCopia, hacerCopia, revisarCopia } from '../src/main/servicios/copias';
import { abrirBaseDeDatos, cerrarBaseDeDatos } from '../src/main/db/conexion';
import { AHORA, baseNueva, cancha, cliente, reservar, usuario } from './ayudantes';

describe('complejo', () => {
  it('guarda los datos y la seña; valida el porcentaje', () => {
    const db = baseNueva();
    expect(obtenerComplejo(db).senaPorcentaje).toBe(30);
    guardarComplejo(db, esquemaComplejo.parse({ nombre: 'Golazo', direccion: 'Av. 25 de Mayo 123', telefono: '', senaPorcentaje: 50 }));
    expect(obtenerComplejo(db)).toEqual({ nombre: 'Golazo', direccion: 'Av. 25 de Mayo 123', telefono: '', senaPorcentaje: 50 });
    expect(() => esquemaComplejo.parse({ nombre: 'X', senaPorcentaje: 120 })).toThrow('no puede pasar del 100');
    expect(() => esquemaComplejo.parse({ nombre: '', senaPorcentaje: 30 })).toThrow('Escribí el nombre');
  });
});

describe('usuarios y sesión', () => {
  it('entra con el PIN correcto y se bloquea después de 5 errores', () => {
    const db = baseNueva();
    reiniciarSesionParaPruebas();
    const id = usuario(db, 'Ana');
    expect(() => iniciarSesion(db, id, '0000', 1000)).toThrow('PIN incorrecto.');
    for (let i = 0; i < 3; i++) expect(() => iniciarSesion(db, id, '0000', 1000)).toThrow('PIN incorrecto.');
    expect(() => iniciarSesion(db, id, '0000', 1000)).toThrow('Esperá 30 segundos');
    expect(() => iniciarSesion(db, id, '1234', 1000)).toThrow('Demasiados intentos');
    expect(iniciarSesion(db, id, '1234', 1000 + 31_000).nombre).toBe('Ana');
    cerrarSesion();
  });

  it('el encargado no entra a lo de administración', () => {
    const db = baseNueva();
    reiniciarSesionParaPruebas();
    const enc = usuario(db, 'Lucas', 'encargado');
    expect(() => requerir('sesion')).toThrow('La sesión se cerró');
    iniciarSesion(db, enc, '1234');
    requerir('sesion');
    expect(() => requerir('admin')).toThrow('solo administración');
    cerrarSesion();
  });

  it('siempre queda un administrador y nadie se da de baja a sí mismo', () => {
    const db = baseNueva();
    const a = usuario(db, 'Ana');
    const b = usuario(db, 'Beto');
    expect(() => darDeBajaUsuario(db, a, a)).toThrow('No podés darte de baja');
    darDeBajaUsuario(db, b, a);
    expect(() => darDeBajaUsuario(db, a, b)).toThrow(); // Beto ya no existe como activo
    expect(() => guardarUsuario(db, esquemaUsuario.parse({ id: a, nombre: 'Ana', rol: 'encargado' }))).toThrow('al menos un usuario de administración');
    expect(listarUsuarios(db).map((u) => u.nombre)).toEqual(['Ana']);
  });
});

describe('datos de ejemplo', () => {
  it('carga canchas, clientes, reservas y un encargado; solo en un sistema vacío', () => {
    const db = baseNueva();
    usuario(db, 'Ana');
    const r = cargarEjemplo(db, AHORA);
    expect(r.canchas).toBe(5);
    expect(r.clientes).toBe(14);
    expect(r.reservas).toBeGreaterThan(100);
    expect(r.usuarios).toEqual([{ nombre: 'Lucas', rol: 'encargado', pin: '2222' }]);
    expect(() => cargarEjemplo(db, AHORA)).toThrow('Ya hay canchas cargadas');
    expect(resumen(db).canchas).toBe(5);
  });

  it('lo cargado es coherente: nada pisado, el pasado jugado y el futuro pendiente, pagos que no pasan el precio', () => {
    const db = baseNueva();
    cargarEjemplo(db, AHORA);
    const todas = reservasDelRango(db, { desde: '2026-11-04', hasta: '2026-11-25' });
    expect(todas.filter((r) => r.fecha < '2026-11-11').every((r) => r.estado !== 'reservada')).toBe(true);
    expect(todas.filter((r) => r.fecha > '2026-11-11').every((r) => r.estado === 'reservada')).toBe(true);
    expect(todas.every((r) => r.pagadoCentavos <= r.precioCentavos)).toBe(true);
    // La noche cuesta más que la tarde en las canchas de fútbol 1 y 2
    const c1 = listarCanchas(db).find((c) => c.nombre === 'Cancha 1')!;
    const noche = todas.find((r) => r.canchaId === c1.id && r.desde >= '19:00');
    const tarde = todas.find((r) => r.canchaId === c1.id && r.desde < '19:00');
    expect(noche?.precioCentavos).toBe(3_000_000);
    expect(tarde?.precioCentavos).toBe(2_200_000);
  });
});

describe('copias de seguridad', () => {
  it('hace la copia, la revisa y rechaza archivos que no son de Canchas', async () => {
    const carpeta = mkdtempSync(path.join(tmpdir(), 'canchas-copia-'));
    try {
      const db = baseNueva();
      reservar(db, { canchaId: cancha(db), clienteId: cliente(db) });
      const copia = await hacerCopia(db, path.join(carpeta, 'una.db'));
      const resumenCopia = revisarCopia(copia.ruta);
      expect(resumenCopia.clientes).toBe(1);
      expect(resumenCopia.reservas).toBe(1);
      expect(descripcionDeCopia(resumenCopia)).toBe('1 cliente y 1 reserva');
      // Una base cualquiera de SQLite (por ejemplo, de otro sistema) no sirve
      cerrarBaseDeDatos();
      const ajena = abrirBaseDeDatos(path.join(carpeta, 'ajena.db'));
      ajena.$client.exec('DROP TABLE reservas; DROP TABLE configuracion;');
      cerrarBaseDeDatos();
      expect(() => revisarCopia(path.join(carpeta, 'ajena.db'))).toThrow('no es una copia de Canchas');
    } finally {
      cerrarBaseDeDatos();
      rmSync(carpeta, { recursive: true, force: true });
    }
  });

  it('una sola copia automática por día, y se guardan solo las últimas 10', async () => {
    const carpeta = mkdtempSync(path.join(tmpdir(), 'canchas-auto-'));
    try {
      const db = baseNueva();
      expect(await copiaAutomatica(db, carpeta, new Date(2026, 10, 1, 9, 0))).toBeDefined();
      expect(await copiaAutomatica(db, carpeta, new Date(2026, 10, 1, 18, 0))).toBeNull();
      for (let d = 2; d <= 13; d++) await copiaAutomatica(db, carpeta, new Date(2026, 10, d, 9, 0));
      const quedan = copiasAutomaticas(carpeta);
      expect(quedan).toHaveLength(10);
      expect(quedan[0]?.nombre).toBe('canchas-automatica-2026-11-13-0900.db');
    } finally {
      cerrarBaseDeDatos();
      rmSync(carpeta, { recursive: true, force: true });
    }
  });
});
