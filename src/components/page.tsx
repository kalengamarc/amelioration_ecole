'use client'

import Image from "next/image";
import logoSrc from "@/assets/logo.png";
import backgroundImage from "@/assets/bg-jesus.png";

export default function Home() {
  return (
    <div
      className="relative flex flex-col min-h-screen font-poppins overflow-hidden bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url(${backgroundImage.src})` }}
    >
      <div className="absolute inset-0 bg-black/45 z-0" />

      <main className="relative flex-1 flex flex-col items-center justify-center px-4 sm:px-8 py-12 z-10">
        

        <div className="text-center max-w-2xl mx-auto mb-10 animate-fade-in-up">
          <h1 className="text-[18px] md:text-3xl font-bold text-white mb-3 drop-shadow-md">
            Complexe Scolaire{" "}
            <span className="text-blue-200">Le Bon Berger</span>
          </h1>
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="h-px w-12 bg-blue-300/60"></div>
            <span className="text-blue-200/80 text-sm uppercase tracking-wider">SGFS</span>
            <div className="h-px w-12 bg-blue-300/60"></div>
          </div>
          
          <p className="text-white/70 text-[14px] max-w-lg mx-auto leading-relaxed drop-shadow-sm">
           Système de Gestion Financière et Scolaire — Une solution complète pour gérer les inscriptions,
            la scolarité, les paiements, les finances et le suivi des élèves en toute simplicité.
          </p>
        </div>

        {/* ── BOUTON AVEC window.location.href ── */}
        <button
            onClick={() => window.dispatchEvent(new Event('go-to-login'))}
            className="font-mulish flex items-center justify-center gap-2 rounded-full bg-blue-900 px-8 py-3.5 text-[14px] font-semibold text-white transition-all duration-200 hover:bg-blue-800 hover:shadow-lg hover:shadow-blue-900/30 hover:scale-[1.03] active:scale-[0.98] w-60"
            >
            Commencer
        </button>
      </main>

      <footer className="relative z-10 backdrop-blur-sm py-5">
        <div className="container mx-auto px-4 text-center">
          <p className="text-white/50 text-sm">
            © {new Date().getFullYear()}{" "}
            <span className="text-white/70">CS. Le Bon Berger</span> — Tous droits réservés
          </p>
          <p className="text-white/30 text-xs mt-1">
            Système de Gestion Financière et Scolaire | Version 1.0
          </p>
        </div>
      </footer>
    </div>
  );
}