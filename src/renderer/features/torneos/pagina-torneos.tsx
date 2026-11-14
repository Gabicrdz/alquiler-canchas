// Lista de torneos: los que están en marcha primero, y un botón para crear uno nuevo.
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Plus, Trophy } from 'lucide-react';
import { NOMBRE_DEPORTE } from '@compartido/canchas';
import { pesos } from '@compartido/dinero';
import { NOMBRE_ESTADO_TORNEO } from '@compartido/esquemas';
import { Button } from '@/components/ui/button';
import { Encabezado, Vacio } from '@/features/comun/encabezado';
import { useTorneos } from '@/features/comun/consultas';
import { COLOR } from '@/features/reservas/estilos';
import { rangoCorto } from '@/lib/fechas';
import { cn } from '@/lib/utils';
import { DialogoTorneo } from './dialogo-torneo';

export function PaginaTorneos() {
  const torneos = useTorneos();
  const navegar = useNavigate();
  const [nuevo, setNuevo] = useState(false);
  const lista = torneos.data ?? [];

  return (
    <div className="mx-auto max-w-[1000px] px-10 pt-9 pb-12">
      <Encabezado titulo="Torneos" detalle="Equipos, inscripción, fixture, resultados y tabla de posiciones.">
        <Button onClick={() => setNuevo(true)}>
          <Plus aria-hidden="true" /> Nuevo torneo
        </Button>
      </Encabezado>

      <div className="mt-6">
        {torneos.isSuccess && lista.length === 0 ? (
          <Vacio
            titulo="Todavía no hay torneos"
            acciones={
              <Button onClick={() => setNuevo(true)}>
                <Plus aria-hidden="true" /> Crear el primero
              </Button>
            }
          >
            Armá un torneo, anotá los equipos, cobrá la inscripción y el sistema arma el fixture y la tabla por vos.
          </Vacio>
        ) : (
          <ul className="grid grid-cols-2 gap-4">
            {lista.map((t) => {
              const c = COLOR[t.deporte];
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => navegar(`/torneos/${t.id}`)}
                    className="group flex w-full flex-col overflow-hidden rounded-xl border border-linea bg-superficie text-left outline-none transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-acento/50"
                  >
                    <div className={cn('flex items-center gap-3 bg-gradient-to-br px-5 py-4 text-white', c.cabecera)}>
                      <Trophy className="size-7 shrink-0 text-pelota" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="truncate font-display text-xl font-bold">{t.nombre}</p>
                        <p className="text-[13px] text-white/85">
                          {NOMBRE_DEPORTE[t.deporte]} · {rangoCorto(t.fechaDesde, t.fechaHasta)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-end justify-between gap-3 px-5 py-4">
                      <div>
                        <p className="marcador text-[26px] leading-none">{t.equipos}</p>
                        <p className="text-[13px] text-tinta-suave">{t.equipos === 1 ? 'equipo' : 'equipos'}</p>
                      </div>
                      <div className="text-center">
                        <p className="marcador text-[26px] leading-none">
                          {t.partidosJugados}
                          <span className="text-[18px] text-tinta-suave">/{t.partidos}</span>
                        </p>
                        <p className="text-[13px] text-tinta-suave">partidos jugados</p>
                      </div>
                      <div className="text-right">
                        <p className="marcador text-[20px] leading-none">{pesos(t.cobradoCentavos)}</p>
                        <p className="text-[13px] text-tinta-suave">inscripciones</p>
                      </div>
                    </div>
                    <p className={cn('border-t border-linea px-5 py-2 text-[13px] font-semibold', t.estado === 'terminado' ? 'text-tinta-suave' : c.fuerte)}>{NOMBRE_ESTADO_TORNEO[t.estado]}</p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <DialogoTorneo abierto={nuevo} alCerrar={() => setNuevo(false)} alCrear={(id) => navegar(`/torneos/${id}`)} />
    </div>
  );
}
