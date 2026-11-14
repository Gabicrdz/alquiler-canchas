// Reportes (solo administración): cuánto se ocupan las canchas, cuánta plata
// entra, quiénes deben. Todos los números los calcula el main; acá solo se dibujan.
import { useState } from 'react';
import { addMonths, endOfMonth, format, parseISO, startOfMonth, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { Banknote, CalendarCheck, Percent, Wallet } from 'lucide-react';
import { pesos } from '@compartido/dinero';
import { NOMBRE_METODO } from '@compartido/esquemas';
import { NOMBRE_DIA } from '@compartido/horarios';
import type { Reporte } from '@compartido/tipos';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { BarrasHorizontales } from '@/components/graficos/barras';
import { GraficoColumnas, type Columna } from '@/components/graficos/columnas';
import { TarjetaGrafico } from '@/components/graficos/tarjeta-grafico';
import { Encabezado, Vacio } from '@/features/comun/encabezado';
import { useReporte } from '@/features/comun/consultas';
import { fechaCorta, fechaISO, rangoCorto } from '@/lib/fechas';
import { cn } from '@/lib/utils';
import { BotonAviso } from './boton-aviso';

const hoyISO = () => fechaISO(new Date());
const pct = (x: number) => `${Math.round(x * 100)} %`;

type Atajo = '7' | '30' | 'mes' | 'mes-pasado' | 'otro';
function rangoDeAtajo(a: Exclude<Atajo, 'otro'>): { desde: string; hasta: string } {
  const hoy = new Date();
  if (a === '7') return { desde: fechaISO(subDays(hoy, 6)), hasta: fechaISO(hoy) };
  if (a === '30') return { desde: fechaISO(subDays(hoy, 29)), hasta: fechaISO(hoy) };
  if (a === 'mes') return { desde: fechaISO(startOfMonth(hoy)), hasta: fechaISO(hoy) };
  const pasado = addMonths(hoy, -1);
  return { desde: fechaISO(startOfMonth(pasado)), hasta: fechaISO(endOfMonth(pasado)) };
}
const ATAJOS: { id: Exclude<Atajo, 'otro'>; nombre: string }[] = [
  { id: '7', nombre: '7 días' },
  { id: '30', nombre: '30 días' },
  { id: 'mes', nombre: 'Este mes' },
  { id: 'mes-pasado', nombre: 'Mes pasado' },
];

/** Plata corta para el eje: "$ 150 mil", "$ 1,2 M". */
function plataCorta(centavos: number): string {
  const p = centavos / 100;
  if (p >= 1_000_000) return `$ ${(p / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} M`;
  if (p >= 1000) return `$ ${(p / 1000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} mil`;
  return `$ ${p}`;
}

/** Hasta 62 días se dibuja una columna por día; más que eso, una por mes. */
function columnasDeIngresos(r: Reporte): Columna[] {
  if (r.porDia.length <= 62) {
    return r.porDia.map((d) => ({
      clave: d.fecha,
      etiqueta: format(parseISO(d.fecha), r.porDia.length <= 10 ? 'EEE d' : 'd', { locale: es }),
      titulo: format(parseISO(d.fecha), "EEEE d 'de' MMMM", { locale: es }),
      valor: d.cobradoCentavos,
      detalle: `${d.reservas} ${d.reservas === 1 ? 'turno' : 'turnos'} ese día`,
    }));
  }
  const meses = new Map<string, { valor: number; reservas: number }>();
  for (const d of r.porDia) {
    const m = meses.get(d.fecha.slice(0, 7)) ?? { valor: 0, reservas: 0 };
    m.valor += d.cobradoCentavos;
    m.reservas += d.reservas;
    meses.set(d.fecha.slice(0, 7), m);
  }
  return [...meses].map(([mes, m]) => ({
    clave: mes,
    etiqueta: format(parseISO(`${mes}-01`), 'MMM', { locale: es }),
    titulo: format(parseISO(`${mes}-01`), "MMMM 'de' yyyy", { locale: es }),
    valor: m.valor,
    detalle: `${m.reservas} turnos`,
  }));
}

function Dato({ icono: Icono, titulo, valor, detalle, acento }: { icono: typeof Wallet; titulo: string; valor: string; detalle: string; acento?: string }) {
  return (
    <div className="rounded-lg border border-linea bg-superficie p-5">
      <p className="flex items-center gap-2 text-[14px] font-semibold text-tinta-suave">
        <Icono className="size-[17px]" aria-hidden="true" /> {titulo}
      </p>
      <p className={cn('marcador mt-2 text-[34px] leading-none', acento)}>{valor}</p>
      <p className="mt-2 text-[13px] text-tinta-suave">{detalle}</p>
    </div>
  );
}

/** Mapa de calor: filas = días de la semana, columnas = horas. Más verde = más ocupado. */
function MapaDeCalor({ mapa }: { mapa: Reporte['mapa'] }) {
  const horas = [...new Set(mapa.map((m) => m.hora))].sort();
  const celda = (dia: number, hora: string) => mapa.find((m) => m.dia === dia && m.hora === hora);
  if (!horas.length) return <p className="py-8 text-center text-tinta-suave">No hay turnos en este período.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-1 text-center text-[12px]">
        <caption className="sr-only">Porcentaje de ocupación por día de la semana y hora de inicio</caption>
        <thead>
          <tr>
            <td />
            {horas.map((h) => (
              <th key={h} scope="col" className="numeros pb-1 font-semibold text-tinta-suave">
                {Number(h.slice(0, 2))}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[1, 2, 3, 4, 5, 6, 7].map((dia) => (
            <tr key={dia}>
              <th scope="row" className="w-12 pr-1 text-right text-[13px] font-semibold text-tinta-suave first-letter:uppercase">
                {NOMBRE_DIA[dia]!.slice(0, 3)}
              </th>
              {horas.map((h) => {
                const c = celda(dia, h);
                if (!c || !c.disponibles) return <td key={h} className="h-9 rounded bg-fondo" aria-label="sin turnos" />;
                const x = c.ocupados / c.disponibles;
                return (
                  <td
                    key={h}
                    title={`${NOMBRE_DIA[dia]} ${h}: ${c.ocupados} de ${c.disponibles} turnos (${pct(x)})`}
                    className={cn('numeros h-9 min-w-9 rounded font-semibold', x > 0.55 ? 'text-white' : 'text-tinta')}
                    style={{ backgroundColor: `color-mix(in oklab, var(--dato-activo) ${Math.round(x * 100)}%, #eef5ef)` }}
                  >
                    {Math.round(x * 100)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[12px] text-tinta-suave">Cada casillero es el % de turnos ocupados a esa hora de inicio, sumando todas las canchas activas. Las horas son de inicio (21 = turnos que arrancan entre las 21:00 y las 21:59).</p>
    </div>
  );
}

export function PaginaReportes() {
  const [atajo, setAtajo] = useState<Atajo>('30');
  const [rango, setRango] = useState(() => rangoDeAtajo('30'));
  const reporte = useReporte(rango);
  const r = reporte.data;

  const elegir = (a: Exclude<Atajo, 'otro'>) => {
    setAtajo(a);
    setRango(rangoDeAtajo(a));
  };
  const cambiarFecha = (campo: 'desde' | 'hasta', valor: string) => {
    if (!valor) return;
    setAtajo('otro');
    setRango((actual) => {
      const nuevo = { ...actual, [campo]: valor };
      // si se cruzan, se mueve el otro extremo para que el rango siga siendo válido
      if (nuevo.desde > nuevo.hasta) return campo === 'desde' ? { ...nuevo, hasta: valor } : { ...nuevo, desde: valor };
      return nuevo;
    });
  };

  const ingresos = r ? columnasDeIngresos(r) : [];
  const sinMovimiento = r && r.resumen.reservas === 0 && r.resumen.cobradoCentavos === 0;

  return (
    <div className="mx-auto max-w-[1100px] px-10 pt-9 pb-12">
      <Encabezado titulo="Reportes" detalle={r ? `Del ${fechaCorta(r.desde)} al ${fechaCorta(r.hasta)}` : 'Cómo viene el complejo'} />

      <div className="mt-5 flex flex-wrap items-end gap-x-5 gap-y-3">
        <div role="group" aria-label="Período" className="flex flex-wrap gap-1.5">
          {ATAJOS.map((a) => (
            <Button key={a.id} variant={atajo === a.id ? 'oscuro' : 'outline'} size="sm" aria-pressed={atajo === a.id} onClick={() => elegir(a.id)}>
              {a.nombre}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-[14px] text-tinta-suave">
          <label htmlFor="r-desde">Desde</label>
          <Input id="r-desde" type="date" className="h-9 w-[150px]" value={rango.desde} max={rango.hasta} onChange={(e) => cambiarFecha('desde', e.target.value)} />
          <label htmlFor="r-hasta">hasta</label>
          <Input id="r-hasta" type="date" className="h-9 w-[150px]" value={rango.hasta} onChange={(e) => cambiarFecha('hasta', e.target.value)} />
        </div>
      </div>

      {reporte.isError && <p role="alert" className="mt-6 rounded-lg border border-rojo/30 bg-rojo-suave p-4 text-rojo">{reporte.error.message}</p>}

      {r && sinMovimiento && (
        <div className="mt-6">
          <Vacio titulo="Sin movimiento en este período">No hubo reservas ni cobros entre {rangoCorto(r.desde, r.hasta)}. Probá con otro período.</Vacio>
        </div>
      )}

      {r && !sinMovimiento && (
        <div className={cn('mt-6 flex flex-col gap-5 transition-opacity', reporte.isPlaceholderData && 'opacity-60')}>
          <div className="grid grid-cols-4 gap-4">
            <Dato icono={Banknote} titulo="Cobrado" valor={pesos(r.resumen.cobradoCentavos)} detalle="Plata que entró en el período" />
            <Dato icono={Percent} titulo="Ocupación" valor={pct(r.resumen.ocupacion)} detalle={`${r.resumen.turnosOcupados} de ${r.resumen.turnosDisponibles} turnos`} />
            <Dato
              icono={CalendarCheck}
              titulo="Turnos"
              valor={String(r.resumen.reservas)}
              detalle={`${r.resumen.jugadas} jugados · ${r.resumen.ausentes} no vinieron · ${r.resumen.canceladas} cancelados`}
            />
            <Dato
              icono={Wallet}
              titulo="Por cobrar"
              valor={pesos(r.resumen.porCobrarCentavos)}
              detalle={r.deudores.length ? `${r.deudores.length} ${r.deudores.length === 1 ? 'turno jugado' : 'turnos jugados'} con saldo` : 'Nadie debe nada'}
              acento={r.resumen.porCobrarCentavos > 0 ? 'text-rojo' : undefined}
            />
          </div>

          <div className="grid grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] gap-5">
            <TarjetaGrafico
              titulo="Ingresos"
              descripcion={ingresos.length && r.porDia.length > 62 ? 'Por mes, según el día en que se cobró' : 'Por día, según el día en que se cobró'}
              tabla={{ columnas: [r.porDia.length > 62 ? 'Mes' : 'Día', 'Cobrado'], filas: ingresos.map((c) => [c.titulo, pesos(c.valor)]) }}
            >
              {r.resumen.cobradoCentavos > 0 ? (
                <GraficoColumnas columnas={ingresos} nombre="Ingresos cobrados" formatear={pesos} formatearEje={plataCorta} />
              ) : (
                <p className="py-16 text-center text-tinta-suave">En este período no se cobró nada.</p>
              )}
            </TarjetaGrafico>
            <TarjetaGrafico
              titulo="Cómo pagan"
              descripcion="Por medio de pago"
              tabla={{ columnas: ['Medio', 'Cobros', 'Total'], filas: r.porMetodo.map((m) => [NOMBRE_METODO[m.metodo], m.cobros, pesos(m.centavos)]) }}
            >
              <BarrasHorizontales
                conPorcentaje
                formatear={pesos}
                barras={r.porMetodo.map((m) => ({ clave: m.metodo, etiqueta: NOMBRE_METODO[m.metodo], valor: m.centavos, detalle: `${m.cobros} ${m.cobros === 1 ? 'cobro' : 'cobros'}` }))}
              />
            </TarjetaGrafico>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-5">
            <TarjetaGrafico
              titulo="Ocupación por cancha"
              descripcion="Turnos tomados sobre los que ofrecía"
              tabla={{ columnas: ['Cancha', 'Turnos', 'Ocupación', 'Cobrado'], filas: r.porCancha.map((c) => [c.nombre, `${c.reservas}/${c.turnosDisponibles}`, pct(c.ocupacion), pesos(c.cobradoCentavos)]) }}
            >
              <BarrasHorizontales
                formatear={pct}
                barras={r.porCancha.map((c) => ({ clave: String(c.canchaId), etiqueta: c.nombre, valor: c.ocupacion, detalle: pesos(c.cobradoCentavos) }))}
              />
            </TarjetaGrafico>
            <TarjetaGrafico titulo="Horarios que más se llenan" descripcion="Día de la semana por hora de inicio">
              <MapaDeCalor mapa={r.mapa} />
            </TarjetaGrafico>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-5">
            <TarjetaGrafico titulo="Clientes que más vienen" descripcion="Por cantidad de turnos">
              {r.topClientes.length === 0 ? (
                <p className="text-tinta-suave">Todavía no hay turnos.</p>
              ) : (
                <ol className="flex flex-col">
                  {r.topClientes.map((c, i) => (
                    <li key={c.clienteId} className="flex items-baseline gap-3 border-b border-linea py-2 last:border-0">
                      <span className="marcador w-5 text-[15px] text-tinta-suave">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate font-semibold">{c.nombre}</span>
                      <span className="numeros text-[14px] text-tinta-suave">{c.reservas} {c.reservas === 1 ? 'turno' : 'turnos'}</span>
                      <span className="numeros w-24 text-right text-[14px] font-semibold">{pesos(c.gastoCentavos)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </TarjetaGrafico>
            <TarjetaGrafico titulo="Para reclamar" descripcion="Turnos jugados que todavía tienen saldo">
              {r.deudores.length === 0 ? (
                <p className="rounded-lg bg-verde-suave px-4 py-6 text-center font-semibold text-verde">Todo cobrado. No hay saldos pendientes.</p>
              ) : (
                <ul className="flex max-h-[340px] flex-col overflow-auto">
                  {r.deudores.map((d) => (
                    <li key={d.reservaId} className="flex items-center gap-3 border-b border-linea py-2 last:border-0">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{d.cliente}</p>
                        <p className="text-[13px] text-tinta-suave">
                          {d.cancha} · {fechaCorta(d.fecha)} {d.desde} h
                        </p>
                      </div>
                      <span className="marcador text-[17px] text-rojo">{pesos(d.saldoCentavos)}</span>
                      <BotonAviso reservaId={d.reservaId} tipo="cobro" size="sm">
                        Avisar
                      </BotonAviso>
                    </li>
                  ))}
                </ul>
              )}
            </TarjetaGrafico>
          </div>
        </div>
      )}
    </div>
  );
}
