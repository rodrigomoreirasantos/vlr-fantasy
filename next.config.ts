import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
