'use client'

import Image from "next/image"
import logoSrc from "@/assets/logo.png"
import backgroundImage from "@/assets/bg-jesus.png"
import { Sparkles, ArrowRight, ShieldCheck, GraduationCap, Banknote } from "lucide-react"

export default function Home() {
  return (
    <div
      className="relative flex flex-col h-screen w-screen font-poppins overflow-hidden bg-cover bg-center bg-no-repeat text-white justify-between"
      style={{ backgroundImage: `url(${backgroundImage.src})` }}
    >
      {/* Léger voile d'arrière-plan préservant la clarté et la présence de Jésus */}
      <div className="absolute inset-0 bg-black/35 z-0" />

      {/* Barre de navigation compacte */}
      <header className="relative z-10 flex items-center justify-between px-4 sm:px-8 py-3 bg-black/20 backdrop-blur-sm border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-white/10 border border-white/20 p-0.5">
            <Image
              src={logoSrc}
              alt="Logo CS. Le Bon Berger Dav/ KAHINDA"
              fill
              sizes="36px"
              className="object-contain p-0.5"
              priority
            />
          </div>
          <div>
            <span className="text-xs sm:text-sm font-extrabold tracking-tight text-white block leading-tight">
              Complexe Scolaire Le Bon Berger Dav/ KAHINDA
            </span>
            <span className="text-[9px] text-amber-400 font-bold uppercase tracking-wider block">
              SGFS-ME
            </span>
          </div>
        </div>

        <button
          onClick={() => window.dispatchEvent(new Event('go-to-login'))}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#d97706] hover:bg-[#b45309] px-4 py-2 text-xs font-bold text-white transition-all duration-200 shadow-md"
        >
          <span>Connexion</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </header>

      {/* Contenu principal compact ajusté pour tenir 100% à l'écran sans scroll */}
      <main className="relative flex-1 flex flex-col items-center justify-center px-4 py-4 z-10 max-w-3xl mx-auto text-center my-auto">

        {/* Titre compact */}
        <h1 className="text-xl sm:text-3xl font-extrabold tracking-tight text-white mb-2 drop-shadow-md leading-snug">
          Complexe Scolaire <span className="text-amber-400">Le Bon Berger Dav/ KAHINDA</span>
        </h1>

        <p className="text-stone-200 text-xs sm:text-sm max-w-lg mx-auto leading-relaxed drop-shadow-sm mb-6 font-medium">
          Système de gestion globale des inscriptions, de la scolarité,
          des encaissements et du suivi des élèves.
        </p>

        {/* 3 Atouts compacts en rangée */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-2xl mb-6 text-left">
          <div className="p-3 rounded-xl bg-[#0c241f]/80 backdrop-blur-md border border-white/10 shadow-md">
            <div className="flex items-center gap-1.5 text-amber-400 font-bold text-xs">
              <GraduationCap className="h-3.5 w-3.5" /> Scolarité
            </div>
            <p className="text-[11px] text-stone-300 font-medium mt-0.5">Élèves et classes.</p>
          </div>

          <div className="p-3 rounded-xl bg-[#0c241f]/80 backdrop-blur-md border border-white/10 shadow-md">
            <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs">
              <Banknote className="h-3.5 w-3.5" /> Caisses
            </div>
            <p className="text-[11px] text-stone-300 font-medium mt-0.5">Paiements et reçus.</p>
          </div>

          <div className="p-3 rounded-xl bg-[#0c241f]/80 backdrop-blur-md border border-white/10 shadow-md">
            <div className="flex items-center gap-1.5 text-sky-400 font-bold text-xs">
              <ShieldCheck className="h-3.5 w-3.5" /> Synchronisation
            </div>
            <p className="text-[11px] text-stone-300 font-medium mt-0.5">Bilan et cloud.</p>
          </div>
        </div>

        {/* Bouton d'action principal */}
        <button
          onClick={() => window.dispatchEvent(new Event('go-to-login'))}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#d97706] hover:bg-[#b45309] px-8 py-3 text-xs sm:text-sm font-extrabold text-white transition-all duration-200 shadow-xl hover:scale-105"
        >
          <span>Commencer</span>
          <ArrowRight className="h-4 w-4" />
        </button>
      </main>

      {/* Pied de page compact */}
      <footer className="relative z-10 backdrop-blur-sm bg-black/20 border-t border-white/10 py-2.5 text-center shrink-0">
        <div className="container mx-auto px-4">
          <p className="text-stone-300 text-[11px] font-medium">
            © {new Date().getFullYear()}{" "}
            <span className="text-amber-400 font-bold">CS. Le Bon Berger Dav/ KAHINDA</span> — Tous droits réservés | SGFS-ME v1.0
          </p>
        </div>
      </footer>
    </div>
  )
}