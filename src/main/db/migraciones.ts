// Migraciones: la lista de cambios de la base, en orden. La versión de la base
// (PRAGMA user_version) dice cuántas ya se aplicaron. REGLA: nunca editar una
// migración que ya se entregó; si hay que cambiar algo, se agrega otra.

export interface Migracion {
  nombre: string;
  sql: string;
}

export const MIGRACIONES: Migracion[] = [
  {
    nombre: 'Complejo: usuarios con PIN, canchas con precios por franja, clientes, reservas sin superposición y pagos',
    sql: /* sql */ `
      CREATE TABLE configuracion (
        clave TEXT PRIMARY KEY,
        valor TEXT NOT NULL
      );
      INSERT INTO configuracion (clave, valor) VALUES
        ('nombre_complejo', 'Mi Complejo'),
        ('direccion', ''),
        ('telefono', ''),
        ('sena_porcentaje', '30');

      -- El PIN NO se guarda: se guarda su "huella" (hash) con una sal al azar.
      CREATE TABLE usuarios (
        id        INTEGER PRIMARY KEY,
        nombre    TEXT    NOT NULL,
        rol       TEXT    NOT NULL CHECK (rol IN ('admin', 'encargado')),
        pin_hash  TEXT    NOT NULL,
        pin_sal   TEXT    NOT NULL,
        activo    INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
        creado_en TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
      );
      CREATE UNIQUE INDEX usuarios_nombre_unico ON usuarios (nombre COLLATE NOCASE) WHERE activo = 1;

      -- Cada cancha tiene su deporte, su duración de turno (fútbol 60, pádel 90…)
      -- y su horario. Los turnos arrancan en la apertura y siguen de a "duracion_min":
      -- así la grilla de reservas nunca queda "torcida".
      CREATE TABLE canchas (
        id                   INTEGER PRIMARY KEY,
        nombre               TEXT    NOT NULL COLLATE NOCASE UNIQUE,
        deporte              TEXT    NOT NULL CHECK (deporte IN ('futbol', 'padel')),
        detalle              TEXT    NOT NULL DEFAULT '',       -- "Fútbol 5 · sintético"
        techada              INTEGER NOT NULL DEFAULT 0 CHECK (techada IN (0, 1)),
        duracion_min         INTEGER NOT NULL DEFAULT 60 CHECK (duracion_min BETWEEN 30 AND 240),
        apertura             TEXT    NOT NULL,                  -- 'HH:MM'
        cierre               TEXT    NOT NULL,                  -- 'HH:MM' o '24:00'
        precio_base_centavos INTEGER NOT NULL DEFAULT 0 CHECK (precio_base_centavos >= 0),
        activo               INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
        creado_en            TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
        CHECK (apertura < cierre)
      );

      -- Precio por franja horaria: de noche (con luz) cuesta más que de día.
      -- "dias" dice si vale para todos los días, de lunes a viernes o el fin de semana.
      CREATE TABLE tarifas (
        id             INTEGER PRIMARY KEY,
        cancha_id      INTEGER NOT NULL REFERENCES canchas (id) ON DELETE CASCADE,
        dias           TEXT    NOT NULL CHECK (dias IN ('todos', 'semana', 'finde')),
        desde          TEXT    NOT NULL,
        hasta          TEXT    NOT NULL,
        precio_centavos INTEGER NOT NULL CHECK (precio_centavos >= 0),
        CHECK (desde < hasta)
      );
      CREATE INDEX tarifas_por_cancha ON tarifas (cancha_id);

      CREATE TABLE clientes (
        id             INTEGER PRIMARY KEY,
        nombre         TEXT    NOT NULL,                        -- una persona o el nombre del equipo
        telefono       TEXT    NOT NULL DEFAULT '',
        notas          TEXT    NOT NULL DEFAULT '',
        busqueda       TEXT    NOT NULL DEFAULT '',             -- nombre y teléfono sin tildes
        activo         INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
        creado_en      TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
        actualizado_en TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
      );
      CREATE INDEX clientes_por_nombre ON clientes (nombre COLLATE NOCASE);

      CREATE TABLE reservas (
        id              INTEGER PRIMARY KEY,
        cancha_id       INTEGER NOT NULL REFERENCES canchas (id),
        cliente_id      INTEGER NOT NULL REFERENCES clientes (id),
        fecha           TEXT    NOT NULL,                       -- 'AAAA-MM-DD'
        desde           TEXT    NOT NULL,                       -- 'HH:MM'
        hasta           TEXT    NOT NULL,                       -- 'HH:MM' o '24:00'
        estado          TEXT    NOT NULL DEFAULT 'reservada'
                        CHECK (estado IN ('reservada', 'jugada', 'ausente', 'cancelada')),
        precio_centavos INTEGER NOT NULL CHECK (precio_centavos >= 0),  -- el precio pactado: no cambia si después cambian las tarifas
        nota            TEXT    NOT NULL DEFAULT '',
        dado_por        INTEGER REFERENCES usuarios (id),
        creado_en       TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
        actualizado_en  TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
        CHECK (desde < hasta)
      );
      CREATE INDEX reservas_por_dia ON reservas (fecha, cancha_id, desde);
      CREATE INDEX reservas_por_cliente ON reservas (cliente_id, fecha);

      -- SEGUNDA LÍNEA DE DEFENSA: aunque el programa ya controla que dos reservas
      -- de la misma cancha no se pisen, la base también se niega. Así, ni un error
      -- del programa ni alguien editando con DB Browser pueden doblar una cancha.
      -- Las canceladas no cuentan: liberan el horario.
      CREATE TRIGGER reservas_sin_superposicion_al_crear
      BEFORE INSERT ON reservas
      WHEN NEW.estado <> 'cancelada'
      BEGIN
        SELECT RAISE(ABORT, 'reserva_superpuesta')
        WHERE EXISTS (
          SELECT 1 FROM reservas r
          WHERE r.cancha_id = NEW.cancha_id AND r.fecha = NEW.fecha AND r.estado <> 'cancelada'
            AND r.desde < NEW.hasta AND NEW.desde < r.hasta
        );
      END;

      CREATE TRIGGER reservas_sin_superposicion_al_cambiar
      BEFORE UPDATE OF cancha_id, fecha, desde, hasta, estado ON reservas
      WHEN NEW.estado <> 'cancelada'
      BEGIN
        SELECT RAISE(ABORT, 'reserva_superpuesta')
        WHERE EXISTS (
          SELECT 1 FROM reservas r
          WHERE r.id <> NEW.id
            AND r.cancha_id = NEW.cancha_id AND r.fecha = NEW.fecha AND r.estado <> 'cancelada'
            AND r.desde < NEW.hasta AND NEW.desde < r.hasta
        );
      END;

      -- Lo que paga el cliente: la seña al reservar y el resto el día del partido.
      -- Los pagos se ANULAN, no se borran (queda el rastro de quién y cuándo).
      CREATE TABLE pagos (
        id             INTEGER PRIMARY KEY,
        reserva_id     INTEGER NOT NULL REFERENCES reservas (id),
        monto_centavos INTEGER NOT NULL CHECK (monto_centavos > 0),
        metodo         TEXT    NOT NULL CHECK (metodo IN ('efectivo', 'transferencia', 'mercadopago', 'tarjeta')),
        anulado        INTEGER NOT NULL DEFAULT 0 CHECK (anulado IN (0, 1)),
        anulado_en     TEXT,
        usuario_id     INTEGER REFERENCES usuarios (id),
        creado_en      TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
      );
      CREATE INDEX pagos_por_reserva ON pagos (reserva_id);
    `,
  },
  {
    nombre: 'Abonos (turnos fijos semanales) y bloqueos (lluvia, mantenimiento)',
    sql: /* sql */ `
      -- Un abono es un turno fijo: la misma cancha, el mismo día y hora, todas las semanas.
      -- El programa lo convierte en reservas comunes de las próximas semanas (así la
      -- grilla, los pagos y los reportes funcionan igual); esta tabla guarda la regla.
      CREATE TABLE abonos (
        id              INTEGER PRIMARY KEY,
        cancha_id       INTEGER NOT NULL REFERENCES canchas (id),
        cliente_id      INTEGER NOT NULL REFERENCES clientes (id),
        dia_semana      INTEGER NOT NULL CHECK (dia_semana BETWEEN 1 AND 7),   -- 1 = lunes … 7 = domingo
        desde           TEXT    NOT NULL,
        hasta           TEXT    NOT NULL,
        desde_fecha     TEXT    NOT NULL,
        hasta_fecha     TEXT,                                                   -- NULL = sigue hasta que se lo termine
        precio_centavos INTEGER NOT NULL CHECK (precio_centavos >= 0),
        nota            TEXT    NOT NULL DEFAULT '',
        activo          INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
        creado_en       TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
        CHECK (desde < hasta)
      );
      CREATE INDEX abonos_por_cancha ON abonos (cancha_id, dia_semana);

      -- De qué abono viene cada reserva (NULL = reserva suelta).
      ALTER TABLE reservas ADD COLUMN abono_id INTEGER REFERENCES abonos (id);
      CREATE INDEX reservas_por_abono ON reservas (abono_id, fecha);

      -- Cierres de una cancha (o de todas) por un rato o por varios días.
      CREATE TABLE bloqueos (
        id          INTEGER PRIMARY KEY,
        cancha_id   INTEGER REFERENCES canchas (id),                            -- NULL = todas las canchas
        fecha_desde TEXT    NOT NULL,
        fecha_hasta TEXT    NOT NULL,
        desde       TEXT,                                                       -- NULL (con hasta) = todo el día
        hasta       TEXT,
        motivo      TEXT    NOT NULL CHECK (motivo IN ('lluvia', 'mantenimiento', 'torneo', 'otro')),
        nota        TEXT    NOT NULL DEFAULT '',
        activo      INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
        creado_en   TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
        CHECK (fecha_desde <= fecha_hasta),
        CHECK ((desde IS NULL) = (hasta IS NULL))
      );
      CREATE INDEX bloqueos_por_fecha ON bloqueos (fecha_hasta, fecha_desde);
    `,
  },
  {
    nombre: 'Torneos: equipos, inscripción con pagos, fixture y resultados',
    sql: /* sql */ `
      -- Un torneo dura unos días, tiene una cuota de inscripción por equipo y (si se quiere)
      -- un bloqueo asociado que cierra las canchas mientras se juega.
      CREATE TABLE torneos (
        id            INTEGER PRIMARY KEY,
        nombre        TEXT    NOT NULL,
        deporte       TEXT    NOT NULL CHECK (deporte IN ('futbol', 'padel')),
        fecha_desde   TEXT    NOT NULL,
        fecha_hasta   TEXT    NOT NULL,
        cuota_centavos INTEGER NOT NULL DEFAULT 0 CHECK (cuota_centavos >= 0),
        estado        TEXT    NOT NULL DEFAULT 'inscripcion' CHECK (estado IN ('inscripcion', 'en_juego', 'terminado')),
        nota          TEXT    NOT NULL DEFAULT '',
        bloqueo_id    INTEGER REFERENCES bloqueos (id),
        activo        INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
        creado_en     TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
        CHECK (fecha_desde <= fecha_hasta)
      );

      CREATE TABLE torneo_equipos (
        id         INTEGER PRIMARY KEY,
        torneo_id  INTEGER NOT NULL REFERENCES torneos (id),
        nombre     TEXT    NOT NULL,
        telefono   TEXT    NOT NULL DEFAULT '',
        activo     INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
        creado_en  TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
      );
      CREATE UNIQUE INDEX torneo_equipos_nombre ON torneo_equipos (torneo_id, nombre COLLATE NOCASE) WHERE activo = 1;

      -- Los pagos de inscripción se anulan, no se borran (igual que los de las reservas).
      CREATE TABLE torneo_pagos (
        id             INTEGER PRIMARY KEY,
        equipo_id      INTEGER NOT NULL REFERENCES torneo_equipos (id),
        monto_centavos INTEGER NOT NULL CHECK (monto_centavos > 0),
        metodo         TEXT    NOT NULL CHECK (metodo IN ('efectivo', 'transferencia', 'mercadopago', 'tarjeta')),
        anulado        INTEGER NOT NULL DEFAULT 0 CHECK (anulado IN (0, 1)),
        anulado_en     TEXT,
        usuario_id     INTEGER REFERENCES usuarios (id),
        creado_en      TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
      );
      CREATE INDEX torneo_pagos_por_equipo ON torneo_pagos (equipo_id);

      -- Cada partido del fixture. Los goles son NULL hasta que se juega.
      CREATE TABLE torneo_partidos (
        id               INTEGER PRIMARY KEY,
        torneo_id        INTEGER NOT NULL REFERENCES torneos (id),
        ronda            INTEGER NOT NULL CHECK (ronda >= 1),
        local_id         INTEGER NOT NULL REFERENCES torneo_equipos (id),
        visitante_id     INTEGER NOT NULL REFERENCES torneo_equipos (id),
        fecha            TEXT,
        hora             TEXT,
        cancha_id        INTEGER REFERENCES canchas (id),
        goles_local      INTEGER CHECK (goles_local IS NULL OR goles_local >= 0),
        goles_visitante  INTEGER CHECK (goles_visitante IS NULL OR goles_visitante >= 0),
        CHECK (local_id <> visitante_id),
        CHECK ((goles_local IS NULL) = (goles_visitante IS NULL)),
        CHECK ((fecha IS NULL) = (hora IS NULL))
      );
      CREATE INDEX torneo_partidos_por_torneo ON torneo_partidos (torneo_id, ronda);
    `,
  },
];
