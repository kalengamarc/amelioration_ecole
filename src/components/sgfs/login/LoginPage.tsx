'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore, DEFAULT_COLOR } from '@/lib/store'
import * as tc from '@/lib/tauri-commands'
import { toast } from 'sonner'
import Image from 'next/image'
import Link from 'next/link'
import {
  User,
  Lock,
  Eye,
  EyeOff,
  LogIn,
  Loader2,
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

      if (response.success) {
        const { token, user } = response.data

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
        toast.error(response.error || 'Identifiants incorrects.')
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
      className="relative flex flex-col min-h-screen font-poppins overflow-hidden bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url(${backgroundImage.src})` }}
    >
      {/* Overlay sombre pour lisibilité */}
      <div className="absolute inset-0 bg-black/40 z-0" />

      <main className="relative flex-1 flex items-center justify-left px-4 py-12 z-10 ml-16">
        <div className="w-full max-w-md">
          <div className="bg-amber-400/20 overflow-hidden rounded-2xl shadow-2xl">
            {/* ── Logo & Branding ── */}
            <div className="p-6 text-center">
              <div className="flex justify-center mb-4">
                <div className="relative">
                  <Image
                    src={logoSrc}
                    alt="Logo Complexe Scolaire Le Bon Berger"
                    width={90}
                    height={90}
                    className="rounded-full relative z-10"
                  />
                </div>
              </div>
              <h2 className="text-xl font-bold text-[#73FBFD]">
                Complexe Scolaire Le Bon Berger
              </h2>
              <p className="text-white text-sm mt-1">
                Système de Gestion Financière et Scolaire
              </p>
            </div>

            {/* ── Formulaire ── */}
            <div className="px-12 py-1">
              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold text-[#73FBFD]">Connexion</h3>
                <p className="text-gray-300 text-sm mt-1">
                  Accédez à votre espace de travail
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Nom d'utilisateur */}
                <div>
                  <Label className="block text-gray-300 font-medium mb-2 text-sm">
                    Nom d&apos;utilisateur
                  </Label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      disabled={isLoading}
                      className="w-full text-[13px] text-white pl-10 pr-4 py-2 border border-gray-300 rounded-full bg-transparent focus:border-blue-900 focus:ring-2 focus:ring-blue-900/20 outline-none transition"
                      placeholder="Entrez votre nom d'utilisateur"
                      required
                      autoComplete="username"
                    />
                  </div>
                </div>

             {/* Mot de passe */}
                <div>
                  <Label className="block text-gray-300 font-medium mb-2 text-sm">
                    Mot de passe
                  </Label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isLoading}
                      className="w-full text-[13px] text-white pl-10 pr-12 py-2 border border-gray-300 rounded-full bg-transparent focus:border-blue-900 focus:ring-2 focus:ring-blue-900/20 outline-none transition"
                      placeholder="Entrez votre mot de passe"
                      required
                      autoComplete="new-password"  // ← CHANGEMENT ICI
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
                      tabIndex={-1}
                      aria-label={
                        showPassword
                          ? 'Masquer le mot de passe'
                          : 'Afficher le mot de passe'
                      }
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
                {/* Bouton de connexion */}
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-[#73FBFD] text-black text-[13px] py-2.5 rounded-full font-semibold hover:bg-blue-800 hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed h-11"
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Connexion en cours...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <LogIn className="h-4 w-4" />
                      Se connecter
                    </span>
                  )}
                </Button>
              </form>
            </div>

                    {/* ── Footer ── */}
            <div className="px-6 pt-6 pb-2 text-center space-y-2">
              <button
                type="button"
                onClick={() => window.dispatchEvent(new Event('go-to-accueil'))}
                className="inline-flex items-center gap-1 text-white/60 hover:text-white text-sm font-medium transition-colors duration-200"
              >
                ← Retour à l&apos;accueil
              </button>
              <p className="text-xs text-white/40">
                © {new Date().getFullYear()}{" "}
                <span className="text-white/50">CS. Le Bon Berger</span> —
                Tous droits réservés
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}