// Asistente IA: assistant_interactions, assistant_function_calls
export const up = async (queryInterface) => {
  await queryInterface.sequelize.query(`
    CREATE TABLE assistant_interactions (
      id                 BIGSERIAL PRIMARY KEY,
      conversation_id    UUID         NOT NULL,
      user_id            INTEGER      NOT NULL,
      user_message       TEXT         NOT NULL,
      assistant_response TEXT,
      model              VARCHAR(100) NOT NULL,
      success            BOOLEAN      NOT NULL,
      error_message      TEXT,
      latency_ms         INTEGER      NOT NULL,
      created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
      CONSTRAINT fk_assistant_interactions_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
      CONSTRAINT chk_assistant_interactions_latency CHECK (latency_ms >= 0)
    );
    CREATE INDEX idx_assistant_interactions_conversation_id ON assistant_interactions (conversation_id);
    CREATE INDEX idx_assistant_interactions_user_id         ON assistant_interactions (user_id);

    CREATE TABLE assistant_function_calls (
      id                 BIGSERIAL PRIMARY KEY,
      interaction_id     BIGINT       NOT NULL,
      function_name      VARCHAR(100) NOT NULL,
      arguments          JSONB        NOT NULL,
      success            BOOLEAN      NOT NULL,
      error_code         VARCHAR(50),
      error_message      TEXT,
      permission_denied  BOOLEAN      NOT NULL DEFAULT false,
      movement_header_id INTEGER,
      latency_ms         INTEGER      NOT NULL,
      created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
      CONSTRAINT fk_assistant_function_calls_interaction_id FOREIGN KEY (interaction_id)
        REFERENCES assistant_interactions(id) ON DELETE CASCADE,
      CONSTRAINT fk_assistant_function_calls_movement_header_id FOREIGN KEY (movement_header_id)
        REFERENCES movement_headers(id) ON DELETE RESTRICT,
      CONSTRAINT chk_assistant_function_calls_latency CHECK (latency_ms >= 0)
    );
    CREATE INDEX idx_assistant_function_calls_function_name ON assistant_function_calls (function_name);
    CREATE INDEX idx_assistant_function_calls_interaction_id ON assistant_function_calls (interaction_id);
  `);
};

export const down = async (queryInterface) => {
  await queryInterface.sequelize.query(`
    DROP TABLE IF EXISTS assistant_function_calls;
    DROP TABLE IF EXISTS assistant_interactions;
  `);
};
