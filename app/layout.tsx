import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VLR Fantasy",
  description:
    "Fantasy game de Valorant: monte seu time com 5 jogadores profissionais e dispute o topo do ranking.",
};

// `viewportFit: "cover"` estende o app por trás dos recortes do celular
// (notch/home indicator) — é o que dá sentido a `env(safe-area-inset-bottom)`
// na `BottomNav` (plano 28, Fase 1). `colorScheme: "dark"` casa com o
// `className="dark"` de `<html>` abaixo: nunca existe modo claro no app.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "dark",
  themeColor: "#0b0d0f",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
        <Toaster theme="dark" />
      </body>
    </html>
  );
}
