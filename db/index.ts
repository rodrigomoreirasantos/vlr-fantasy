import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "@/db/schema";

declare global {
  var __dbPool: Pool | undefined;
}

export const pool =
  global.__dbPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    // Teto baixo de propósito (plano 23, fase 2): em produção a
    // `DATABASE_URL` é a Transaction pooler do Supabase (porta 6543), que já
    // faz o pooling do lado do servidor — a doc oficial recomenda começar
    // com poucas conexões por processo em serverless (o exemplo deles usa
    // `connection_limit=1`) e só subir se aparecer contenção de verdade.
    // Sem `max`, o default do `pg` é 10 por processo, e cada invocação da
    // Vercel é um processo — multiplica rápido contra o "Pool Size" do
    // Supavisor.
    max: 3,
  });

if (process.env.NODE_ENV !== "production") {
  global.__dbPool = pool;
}

export const db = drizzle(pool, { schema });
