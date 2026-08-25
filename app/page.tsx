import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background px-4 text-center">
      <div className="space-y-4">
        <span className="text-sm font-medium tracking-[0.3em] text-primary uppercase">
          Fantasy Game
        </span>
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
          VLR<span className="text-primary">FANTASY</span>
        </h1>
        <p className="mx-auto max-w-md text-balance text-muted-foreground">
          Monte seu time com 5 jogadores profissionais de Valorant, pontue com o
          desempenho real deles em partida e domine o mercado de transferências.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button asChild size="lg">
          <Link href="/signup">Criar conta</Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/login">Entrar</Link>
        </Button>
      </div>
    </main>
  );
}
