-- Migration idempotente: Inverte as porcentagens de score de IA existentes no banco de dados (100 - score)
-- Garante execução única através da tabela de controle _cattle_migrations.

CREATE TABLE IF NOT EXISTS "_cattle_migrations" (
    "name" TEXT NOT NULL,
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "_cattle_migrations_pkey" PRIMARY KEY ("name")
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "_cattle_migrations" WHERE "name" = '20261016150000_invert_ai_scores'
    ) THEN
        UPDATE "Photo"
        SET "score" = ROUND((100.0 - "score")::numeric, 1)::double precision
        WHERE "score" IS NOT NULL
          AND "score" >= 0
          AND "score" <= 100;

        INSERT INTO "_cattle_migrations" ("name")
        VALUES ('20261016150000_invert_ai_scores');
    END IF;
END $$;
