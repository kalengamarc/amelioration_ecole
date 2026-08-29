import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SGFS-ME ",
  description: "Système de Gestion Financière et Scolaire",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-black font-poppins text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}