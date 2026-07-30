'use client'

import { useEffect, useState, useMemo } from 'react'
import { useAppStore, getStoredAuthToken, DEFAULT_COLOR, darkenHex } from '@/lib/store'
import * as tc from '@/lib/tauri-commands'
import Accueil from '@/components/page'
import LoginPage from '@/components/sgfs/login/LoginPage'
import Sidebar from '@/components/sgfs/layout/Sidebar'
import DashboardPage from '@/components/sgfs/dashboard/DashboardPage'
import EtablissementsPage from '@/components/sgfs/etablissements/EtablissementsPage'
import ClassesPage from '@/components/sgfs/classes/ClassesPage'
import ElevesPage from '@/components/sgfs/eleves/ElevesPage'
import EncaissementsPage from '@/components/sgfs/encaissements/EncaissementsPage'
import FraisPage from '@/components/sgfs/frais/FraisPage'
import EcheancesPage from '@/components/sgfs/echeances/EcheancesPage'
import DepensesPage from '@/components/sgfs/depenses/DepensesPage'
import RapportsPage from '@/components/sgfs/rapports/RapportsPage'
import AuditPage from '@/components/sgfs/audit/AuditPage'
import ParametresPage from '@/components/sgfs/parametres/ParametresPage'
import UtilisateursPage from '@/components/sgfs/utilisateurs/UtilisateursPage'
import { Loader2 } from 'lucide-react'
import { Toaster } from '@/components/ui/sonner'

export default function Home() {
  const { isAuthenticated, currentPage, sidebarOpen, user, currentEtablissement, setCurrentEtablissement, setEtabParams } = useAppStore()
  const [loading, setLoading] = useState(true)
  const [etablissements, setEtablissements] = useState<any[]>([])
  
  // --- ÉTAT POUR GÉRER ACCUEIL / LOGIN ---
  const [showLogin, setShowLogin] = useState(false)

  // --- ÉCOUTE DES ÉVÉNEMENTS DE NAVIGATION ---
  useEffect(() => {
    const goToLogin = () => setShowLogin(true)
    const goToAccueil = () => setShowLogin(false)

    window.addEventListener('go-to-login', goToLogin)
    window.addEventListener('go-to-accueil', goToAccueil)

    return () => {
      window.removeEventListener('go-to-login', goToLogin)
      window.removeEventListener('go-to-accueil', goToAccueil)
    }
  }, [])

  // Derive CSS variable values from the store
  const cssVars = useMemo(() => {
    const color = currentEtablissement?.couleurPrincipale || DEFAULT_COLOR
    return {
      '--etab-color': color,
      '--etab-color-hover': darkenHex(color),
      '--etab-color-light': color + '10',
    } as React.CSSProperties
  }, [currentEtablissement?.couleurPrincipale])

  // Verify session on mount
  useEffect(() => {
    async function checkSession() {
      try {
        const token = getStoredAuthToken()
        if (!token) { useAppStore.getState().logout(); setLoading(false); return }
        const data = await tc.getMe(token)
        if (data.success && data.data) {
          useAppStore.getState().login(data.data, token)
        } else {
          useAppStore.getState().logout()
        }
      } catch {
        useAppStore.getState().logout()
      } finally {
        setLoading(false)
      }
    }
    checkSession()
  }, [])

  // Fetch schools when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      tc.listEtablissements()
        .then((data: any) => setEtablissements(data.etablissements || []))
        .catch(() => {})
    }
  }, [isAuthenticated])

  // Populate store with current établissement context & params
  useEffect(() => {
    if (!isAuthenticated || !user || etablissements.length === 0) return

    let targetId: string | undefined
    if (user.role === 'COORDINATEUR') {
      const firstActive = etablissements.find((e: any) => e.actif !== false)
      targetId = firstActive?.id
    } else {
      targetId = user.etablissementId || undefined
    }

    if (!targetId) return

    tc.getEtablissementContext(targetId)
      .then((data: any) => {
        if (data.success && data.data) {
          setCurrentEtablissement(data.data.etablissement)
          setEtabParams(data.data.parametres ?? null)
        }
      })
      .catch(() => {})
  }, [isAuthenticated, user, etablissements])

  // --- SYNCHRONISATION AUTOMATIQUE EN ARRIÈRE-PLAN (TOUTES LES 5 MINUTES) ---
  useEffect(() => {
    if (!isAuthenticated) return

    const runAutoSync = async () => {
      try {
        const statusRes = await tc.syncStatus()
        const status = statusRes?.data ?? statusRes ?? {}
        if (status.configured) {
          console.log('[Auto-Sync] Synchronisation automatique en cours...')
          await tc.syncPush()
          console.log('[Auto-Sync] Synchronisation automatique réussie.')
        }
      } catch (err) {
        console.warn('[Auto-Sync] Erreur en arrière-plan :', err)
      }
    }

    // Premier déclenchement après 15 secondes
    const initialTimer = setTimeout(runAutoSync, 15000)
    // Boucle toutes les 5 minutes
    const interval = setInterval(runAutoSync, 5 * 60 * 1000)

    return () => {
      clearTimeout(initialTimer)
      clearInterval(interval)
    }
  }, [isAuthenticated])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8faf9]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-[var(--etab-color,#075e54)] flex items-center justify-center">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342" />
            </svg>
          </div>
          <Loader2 className="w-6 h-6 text-[var(--etab-color,#075e54)] animate-spin" />
          <p className="text-sm text-[#64748b]">Chargement de SGFS-ME...</p>
        </div>
      </div>
    )
  }

  // --- GESTION DE L'AFFICHAGE NON AUTHENTIFIÉ ---
  if (!isAuthenticated) {
    if (!showLogin) {
      return <Accueil />
    }
    return <LoginPage />
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <DashboardPage />
      case 'etablissements':
        return <EtablissementsPage />
      case 'classes':
        return <ClassesPage />
      case 'eleves':
        return <ElevesPage />
      case 'encaissements':
        return <EncaissementsPage />
      case 'frais':
        return <FraisPage />
      case 'echeances':
        return <EcheancesPage />
      case 'depenses':
        return <DepensesPage />
      case 'rapports':
        return <RapportsPage />
      case 'audit':
        return <AuditPage />
      case 'parametres':
        return <ParametresPage />
      case 'utilisateurs':
        return <UtilisateursPage />
      default:
        return <DashboardPage />
    }
  }

  return (
    <div className="min-h-screen bg-[#f8faf9] flex" style={cssVars}>
      <Sidebar etablissements={etablissements} />
      <main
        className="flex-1 transition-all duration-300 ease-in-out overflow-auto"
        style={{ marginLeft: sidebarOpen ? '260px' : '72px' }}
      >
        <div className="p-6 max-w-[1600px] mx-auto">
          {renderPage()}
        </div>
      </main>
      <Toaster position="top-right" richColors />
    </div>
  )
}