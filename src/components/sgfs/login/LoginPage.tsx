'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore, DEFAULT_COLOR } from '@/lib/store'
import * as tc from '@/lib/tauri-commands'
import { toast } from 'sonner'
import Image from 'next/image'
import {
  User,
  Lock,
  Eye,
  EyeOff,
  LogIn,
  Loader2,
  Sparkles,
  ArrowLeft
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import logoSrc from '@/assets/logo.png'
import backgroundImage from '@/assets/bg-jesus.png'

interface Etablissement {
  id: string
  nom: string
  type?: string
  couleurPrincipale?: string
  devise?: string
  adresse?: string | null
  telephone?: string | null
  email?: string | null
  logoUrl?: string | null
  rccm?: string | null
  idNat?: string | null
}

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const login = useAppStore((state) => state.login)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!username.trim() || !password.trim()) {
      toast.error('Veuillez remplir tous les champs.')
      return
    }

    setIsLoading(true)

    try {
      const response = await tc.login(username, password)
      const data = (response as any)?.data ?? response ?? {}
      const token = data.token
      const user = data.user

      if (token && user) {
        login(user, token)

        try {
          const etabRes = await tc.listEtablissements(
            user.etablissementId || undefined
          )
          const etablissements: Etablissement[] =
            etabRes?.etablissements ?? []
          let selectedEtab: Etablissement | null = null

          if (user.etablissementId) {
            selectedEtab =
              etablissements.find((e) => e.id === user.etablissementId) ??
              etablissements[0] ??
              null
          } else if (etablissements.length > 0) {
            selectedEtab = etablissements[0]
          }

          if (selectedEtab) {
            useAppStore.getState().setCurrentEtablissement({
              id: selectedEtab.id,
              nom: selectedEtab.nom,
              type: selectedEtab.type || 'PRIMAIRE',
              couleurPrincipale:
                selectedEtab.couleurPrincipale || DEFAULT_COLOR,
              devise: selectedEtab.devise || 'BIF',
              adresse: selectedEtab.adresse ?? null,
              telephone: selectedEtab.telephone ?? null,
              email: selectedEtab.email ?? null,
              logoUrl: selectedEtab.logoUrl ?? null,
              rccm: selectedEtab.rccm ?? null,
              idNat: selectedEtab.idNat ?? null,
            })
          }
        } catch (etabErr) {
          console.warn("Impossible d'initialiser l'établissement", etabErr)
        }

        toast.success(`Bienvenue, ${user.nomComplet} !`)
        router.push('/')
      } else {
        toast.error((response as any)?.error || 'Identifiants incorrects.')
      }
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Une erreur est survenue lors de la connexion.'
      toast.error(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div
      className="relative flex flex-col h-screen w-screen font-poppins overflow-hidden bg-cover bg-center bg-no-repeat text-white"
      style={{ backgroundImage: `url(${backgroundImage.src})` }}
    >
      {/* Léger filtre pour préserver la clarté et la visibilité intégrale de l'image de Jésus */}
      <div className="absolute inset-0 bg-black/30 z-0" />

      {/* Disposition : Carte positionnée sur le CÔTÉ DROIT pour ne JAMAIS masquer le visage de Jésus au centre */}
      <main className="relative flex-1 flex items-center justify-center sm:justify-end px-4 sm:px-12 lg:px-20 py-4 z-10">
        <div className="w-full max-w-[370px]">
          {/* Carte compacte en verre sombre décalée sur la droite */}
          <div className="bg-[#0c241f]/90 backdrop-blur-md overflow-hidden rounded-3xl border border-white/15 shadow-2xl p-5 sm:p-6">
            {/* ── Logo & Branding ── */}
            <div className="text-center mb-4">
              <div className="flex justify-center mb-2">
                <div className="relative h-14 w-14 rounded-2xl bg-white border border-amber-500/30 p-1.5 shadow-md flex items-center justify-center">
                  <Image
                    src={logoSrc}
                    alt="Logo Complexe Scolaire Le Bon Bergerz"
                    width={52}
                    height={72}
                    className="object-contain"
                  />
                </div>
              </div>
              
              <h2 className="text-base font-extrabold text-white tracking-tight leading-snug">
                CS. Le Bon Berger Dav/ KAHINDA
              </h2>
              <p className="text-stone-300 text-[11px] mt-0.5 font-medium">
                Gestion Financière & Scolaire
              </p>
            </div>

            {/* ── Formulaire ── */}
            <form onSubmit={handleSubmit} className="space-y-3">
              {/* Nom d'utilisateur */}
              <div>
                <Label className="block text-stone-200 font-semibold mb-1 text-[11px]">
                  Nom d&apos;utilisateur *
                </Label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400" />
                  <Input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={isLoading}
                    className="w-full text-xs text-white pl-9 pr-3 h-9 border border-stone-600 rounded-xl bg-black/30 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 outline-none transition font-medium"
                    placeholder="Identifiant"
                    required
                    autoComplete="username"
                  />
                </div>
              </div>

              {/* Mot de passe */}
              <div>
                <Label className="block text-stone-200 font-semibold mb-1 text-[11px]">
                  Mot de passe *
                </Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400" />
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    className="w-full text-xs text-white pl-9 pr-10 h-9 border border-stone-600 rounded-xl bg-black/30 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 outline-none transition font-medium"
                    placeholder="Mot de passe"
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-white transition"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Bouton de connexion */}
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full bg-[#d97706] hover:bg-[#b45309] text-white text-xs font-bold rounded-xl shadow-md transition-all duration-200 disabled:opacity-50 h-9 mt-2"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Connexion...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-1.5">
                    <LogIn className="h-3.5 w-3.5" />
                    Se Connecter
                  </span>
                )}
              </Button>
            </form>

            {/* ── Footer ── */}
            <div className="mt-4 pt-3 border-t border-white/10 text-center space-y-1.5">
              <button
                type="button"
                onClick={() => window.dispatchEvent(new Event('go-to-accueil'))}
                className="inline-flex items-center gap-1 text-stone-300 hover:text-amber-400 text-xs font-semibold transition-colors duration-200"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Retour à l&apos;accueil
              </button>
              <p className="text-[10px] text-stone-400 font-medium block">
                © {new Date().getFullYear()}{" "}
                <span className="text-amber-400 font-bold">CS. Le Bon Berger Dav/ KAHINDA</span>
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}