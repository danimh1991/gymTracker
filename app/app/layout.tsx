import type { Metadata, Viewport } from "next";
import { appPath } from "../lib/base-path";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gym Tracker · Tu camino a la calistenia",
  description: "Tu rutina, cada serie y tu evolución en calistenia.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: appPath("/favicon.svg"),
    shortcut: appPath("/favicon.svg"),
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
