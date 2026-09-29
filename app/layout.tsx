import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CAPSED Facturation — Prototype V1",
  description: "Prototype de facturation simple en français pour CAPSED.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className="antialiased">{children}</body>
    </html>
  );
}
