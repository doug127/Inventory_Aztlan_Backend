// Seguridad (roles, users) y autenticación (refresh_tokens, password_reset_tokens, email_outbox, auth_events)
export const up = async (queryInterface) => {
  await queryInterface.sequelize.query(`
    CREATE TABLE roles (
      id          SERIAL PRIMARY KEY,
      code        VARCHAR(30)  NOT NULL,
      name        VARCHAR(50)  NOT NULL,
      description TEXT,
      hierarchy   SMALLINT     NOT NULL,
      is_active   BOOLEAN      NOT NULL DEFAULT true,
      created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
      CONSTRAINT uq_roles_code      UNIQUE (code),
      CONSTRAINT uq_roles_name      UNIQUE (name),
      CONSTRAINT uq_roles_hierarchy UNIQUE (hierarchy),
      CONSTRAINT chk_roles_code      CHECK (code = upper(code)),
      CONSTRAINT chk_roles_hierarchy CHECK (hierarchy >= 0)
    );

    CREATE TABLE users (
      id                    SERIAL PRIMARY KEY,
      username              VARCHAR(50)  NOT NULL,
      email                 VARCHAR(150) NOT NULL,
      password_hash         VARCHAR(255) NOT NULL,
      full_name             VARCHAR(150) NOT NULL,
      role_id               INTEGER      NOT NULL,
      is_active             BOOLEAN      NOT NULL DEFAULT true,
      email_verified_at     TIMESTAMPTZ,
      password_changed_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
      must_change_password  BOOLEAN      NOT NULL DEFAULT false,
      failed_login_attempts INTEGER      NOT NULL DEFAULT 0,
      locked_until          TIMESTAMPTZ,
      last_login_at         TIMESTAMPTZ,
      created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
      updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
      CONSTRAINT uq_users_username UNIQUE (username),
      CONSTRAINT uq_users_email    UNIQUE (email),
      CONSTRAINT fk_users_role_id  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT,
      CONSTRAINT chk_users_username CHECK (username ~ '^[a-z][a-z0-9._]{2,49}$'),
      CONSTRAINT chk_users_email    CHECK (email = lower(email)),
      CONSTRAINT chk_users_failed_login_attempts CHECK (failed_login_attempts >= 0)
    );
    CREATE INDEX idx_users_role_id ON users (role_id);

    CREATE TABLE refresh_tokens (
      id                   BIGSERIAL PRIMARY KEY,
      user_id              INTEGER      NOT NULL,
      token_hash           VARCHAR(255) NOT NULL,
      user_agent           VARCHAR(255),
      ip_address           INET,
      expires_at           TIMESTAMPTZ  NOT NULL,
      revoked_at           TIMESTAMPTZ,
      replaced_by_token_id BIGINT,
      created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
      CONSTRAINT uq_refresh_tokens_token_hash UNIQUE (token_hash),
      CONSTRAINT fk_refresh_tokens_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_refresh_tokens_replaced_by_token_id FOREIGN KEY (replaced_by_token_id)
        REFERENCES refresh_tokens(id) ON DELETE SET NULL
    );
    CREATE INDEX idx_refresh_tokens_user_revoked ON refresh_tokens (user_id, revoked_at);
    CREATE INDEX idx_refresh_tokens_expires_at   ON refresh_tokens (expires_at);

    CREATE TABLE password_reset_tokens (
      id             BIGSERIAL PRIMARY KEY,
      user_id        INTEGER      NOT NULL,
      token_hash     VARCHAR(255) NOT NULL,
      expires_at     TIMESTAMPTZ  NOT NULL,
      used_at        TIMESTAMPTZ,
      invalidated_at TIMESTAMPTZ,
      requested_ip   INET,
      created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
      CONSTRAINT uq_password_reset_tokens_token_hash UNIQUE (token_hash),
      CONSTRAINT fk_password_reset_tokens_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT chk_password_reset_tokens_expires CHECK (expires_at > created_at)
    );
    CREATE UNIQUE INDEX uq_reset_token_active ON password_reset_tokens (user_id)
      WHERE used_at IS NULL AND invalidated_at IS NULL;
    CREATE INDEX idx_password_reset_tokens_user_created ON password_reset_tokens (user_id, created_at);

    CREATE TABLE email_outbox (
      id                      BIGSERIAL PRIMARY KEY,
      user_id                 INTEGER,
      to_email                VARCHAR(150)        NOT NULL,
      template                email_template_enum NOT NULL,
      subject                 VARCHAR(200)        NOT NULL,
      status                  email_status_enum   NOT NULL DEFAULT 'PENDING',
      attempts                INTEGER             NOT NULL DEFAULT 0,
      last_error              TEXT,
      provider_message_id     VARCHAR(255),
      password_reset_token_id BIGINT,
      scheduled_at            TIMESTAMPTZ         NOT NULL DEFAULT now(),
      sent_at                 TIMESTAMPTZ,
      created_at              TIMESTAMPTZ         NOT NULL DEFAULT now(),
      CONSTRAINT fk_email_outbox_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      CONSTRAINT fk_email_outbox_password_reset_token_id FOREIGN KEY (password_reset_token_id)
        REFERENCES password_reset_tokens(id) ON DELETE SET NULL,
      CONSTRAINT chk_email_outbox_attempts CHECK (attempts >= 0),
      CONSTRAINT chk_email_outbox_sent_at  CHECK (status <> 'SENT' OR sent_at IS NOT NULL)
    );
    CREATE INDEX idx_email_outbox_status_scheduled ON email_outbox (status, scheduled_at);
    CREATE INDEX idx_email_outbox_user_id          ON email_outbox (user_id);

    CREATE TABLE auth_events (
      id                 BIGSERIAL PRIMARY KEY,
      user_id            INTEGER,
      username_attempted VARCHAR(150),
      event_type         auth_event_type_enum NOT NULL,
      ip_address         INET,
      user_agent         VARCHAR(255),
      created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT fk_auth_events_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX idx_auth_events_user_created ON auth_events (user_id, created_at);
    CREATE INDEX idx_auth_events_type_created ON auth_events (event_type, created_at);
    CREATE INDEX idx_auth_events_ip_address   ON auth_events (ip_address);
  `);
};

export const down = async (queryInterface) => {
  await queryInterface.sequelize.query(`
    DROP TABLE IF EXISTS auth_events;
    DROP TABLE IF EXISTS email_outbox;
    DROP TABLE IF EXISTS password_reset_tokens;
    DROP TABLE IF EXISTS refresh_tokens;
    DROP TABLE IF EXISTS users;
    DROP TABLE IF EXISTS roles;
  `);
};
