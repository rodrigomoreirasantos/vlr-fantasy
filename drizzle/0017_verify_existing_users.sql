-- Todo usuário que existia antes da verificação obrigatória entra como
-- verificado: ligar `requireEmailVerification` sem isto trancaria a base
-- inteira para fora (plano 19, fato 5).
UPDATE "user" SET "email_verified" = true WHERE "created_at" < NOW();
