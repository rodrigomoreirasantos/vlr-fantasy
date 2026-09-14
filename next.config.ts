import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A tela de login é a página inicial: `/` não tem página própria. O
  // redirect roda antes da renderização (sem invocar função); quem já está
  // logado segue de `/login` para `/home` pela checagem real de sessão da
  // própria página de login. Temporário (307) de propósito: um 308 fica
  // guardado no navegador e nos buscadores, e prenderia `/` no login se um
  // dia a raiz voltar a ter conteúdo.
  async redirects() {
    return [{ source: "/", destination: "/login", permanent: false }];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "owcdn.net",
        port: "",
        // Toda foto de jogador raspada do elenco do vlr é `/img/<hash>.png`.
        pathname: "/img/**",
        // Bloqueia query string — as URLs do vlr nunca têm, e isso fecha a
        // porta de enumeração de chave de cache que uma wildcard abriria.
        search: "",
      },
    ],
    // Foto de jogador muda pouquíssimas vezes (troca de organização, no
    // máximo); 30 dias corta revalidação à toa.
    minimumCacheTTL: 2_592_000,
  },
};

export default nextConfig;
