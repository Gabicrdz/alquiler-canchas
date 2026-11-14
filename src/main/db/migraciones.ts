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
];
