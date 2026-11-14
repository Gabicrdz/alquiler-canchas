// Consultas (leer) y acciones (escribir) con TanStack Query. Cada lista tiene
// una "clave"; después de guardar, se invalidan las claves que cambiaron y
// las pantallas se actualizan solas.
import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { DatosBuscarClientes, DatosRango, DatosRangoReporte } from '@compartido/esquemas';
import { desenvolver, canchas } from '@/lib/api';

export const CLAVES = {
  canchas: ['canchas'],
  clientes: ['clientes'],
  reservas: ['reservas'],
  abonos: ['abonos'],
  bloqueos: ['bloqueos'],
  complejo: ['complejo'],
  resumen: ['resumen'],
  reportes: ['reportes'],
} as const;

export const useCanchas = () => useQuery({ queryKey: CLAVES.canchas, queryFn: () => desenvolver(canchas().canchas.listar()) });
export const useComplejo = () => useQuery({ queryKey: CLAVES.complejo, queryFn: () => desenvolver(canchas().complejo.obtener()) });
export const useResumen = () => useQuery({ queryKey: CLAVES.resumen, queryFn: () => desenvolver(canchas().sistema.resumen()) });

export function useClientes(filtro: DatosBuscarClientes) {
  return useQuery({
    queryKey: [...CLAVES.clientes, filtro],
    queryFn: () => desenvolver(canchas().clientes.buscar(filtro)),
    placeholderData: keepPreviousData, // mientras busca, se sigue viendo la lista anterior
  });
}

/** El reporte de un período (solo administración). Cada cambio de período es una consulta nueva. */
export function useReporte(rango: DatosRangoReporte) {
  return useQuery({
    queryKey: [...CLAVES.reportes, rango],
    queryFn: () => desenvolver(canchas().reportes.obtener(rango)),
    placeholderData: keepPreviousData,
    staleTime: 0, // la plata cambia a cada rato: siempre se vuelve a pedir al entrar
  });
}

export function useReservas(rango: DatosRango) {
  return useQuery({
    queryKey: [...CLAVES.reservas, rango],
    queryFn: () => desenvolver(canchas().reservas.rango(rango)),
    placeholderData: keepPreviousData, // al cambiar de semana no parpadea la grilla
  });
}

export const useAbonos = () => useQuery({ queryKey: CLAVES.abonos, queryFn: () => desenvolver(canchas().abonos.listar()) });
/** Los bloqueos que vienen (no los que ya pasaron). */
export const useBloqueosVigentes = () => useQuery({ queryKey: [...CLAVES.bloqueos, 'vigentes'], queryFn: () => desenvolver(canchas().bloqueos.listar()) });

export function useBloqueos(rango: DatosRango) {
  return useQuery({
    queryKey: [...CLAVES.bloqueos, rango],
    queryFn: () => desenvolver(canchas().bloqueos.rango(rango)),
    placeholderData: keepPreviousData,
  });
}

/**
 * Una acción que escribe en la base: muestra el aviso de éxito y refresca las
 * listas afectadas. El error lo maneja cada pantalla (para mostrarlo donde corresponde).
 */
export function useAccion<A, R>(fn: (args: A) => Promise<R>, claves: readonly (readonly string[])[], exito?: string | ((r: R) => string)) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (r) => {
      await Promise.all([...claves, CLAVES.resumen].map((queryKey) => cliente.invalidateQueries({ queryKey })));
      if (exito) toast.success(typeof exito === 'string' ? exito : exito(r));
    },
  });
}

/** Carga los datos de ejemplo (todas las listas cambian). */
export function useCargarEjemplo() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: () => desenvolver(canchas().sistema.cargarEjemplo()),
    onSuccess: async (r) => {
      await cliente.invalidateQueries();
      toast.success(`Listo: ${r.canchas} canchas, ${r.clientes} clientes y ${r.reservas} reservas de ejemplo`, {
        // El PIN del usuario de ejemplo, para probar el rol de encargado (también está en Ajustes → Usuarios)
        description: r.usuarios.length ? `Usuario para probar: ${r.usuarios.map((u) => `${u.nombre} (PIN ${u.pin})`).join(', ')}.` : undefined,
        duration: r.usuarios.length ? 20_000 : undefined,
      });
    },
    onError: (e) => toast.error(e.message),
  });
}

/** Espera a que dejen de escribir (250 ms) para buscar. */
export function useDemorado<T>(valor: T, ms = 250): T {
  const [demorado, setDemorado] = useState(valor);
  useEffect(() => {
    const t = window.setTimeout(() => setDemorado(valor), ms);
    return () => window.clearTimeout(t);
  }, [valor, ms]);
  return demorado;
}
