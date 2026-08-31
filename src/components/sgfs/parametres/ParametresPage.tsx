'use client'

import { useState, useEffect, useRef } from 'react'
import { useAppStore, canManageSettings, getTypeIcon, onEtabSelect } from '@/lib/store'
import * as tc from '@/lib/tauri-commands'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import {
  ShieldAlert, Save, Palette, MapPin, CalendarDays, Settings, Upload, Plus,
  ToggleLeft, ToggleRight, Building2, RefreshCw, Globe, Database, Key, CheckCircle2,
  AlertCircle, Loader2, Sparkles
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

// ── Types ───────────────────────────────────────────────────────────────────
interface Etablissement {
  id: string; nom: string; type?: string; telephone?: string; email?: string;
  adresse?: string; rccm?: string; idNat?: string;
  logoUrl?: string; couleurPrincipale?: string;
}

interface AnneeScolaire {
  id: string; libelle: string; etablissementId: string; active: boolean;
  dateDebut?: string; dateFin?: string;
}

// ── Animation Variants ──────────────────────────────────────────────────────
const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.07 } } }
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35 } } }

export default function ParametresPage() {
  const { user } = useAppStore()
  const [activeTab, setActiveTab] = useState('identite')
  const [ecoles, setEcoles] = useState<Etablissement[]>([])
  const [selectedEcole, setSelectedEcole] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [identiteForm, setIdentiteForm] = useState({ logo: '', couleurPrimaire: '#1e3a8a' })
  const [logoPosition, setLogoPosition] = useState<'left' | 'center' | 'right'>('center')
  const logoInputRef = useRef<HTMLInputElement | null>(null)
  const [contactForm, setContactForm] = useState({ nom: '', telephone: '', email: '', adresse: '', rccm: '', idNat: '' })
  const [annees, setAnnees] = useState<AnneeScolaire[]>([])
  const [newAnnee, setNewAnnee] = useState({ libelle: '', dateDebut: '', dateFin: '' })
  const [anneeDialogOpen, setAnneeDialogOpen] = useState(false)
  const [configForm, setConfigForm] = useState({ tauxChangeUsdBif: '', mentionsLegales: '', piedPageRecu: '', nomImprimante: '', anneeScolaireId: '' })

  const [syncConfig, setSyncConfig] = useState({ supabaseUrl: '', supabaseKey: '' })
  const [syncStatus, setSyncStatus] = useState<{ configured: boolean; lastSync: string | null } | null>(null)
  const [syncValidation, setSyncValidation] = useState<any>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncSummary, setSyncSummary] = useState<any>(null)

  async function fetchSyncStatus() {
    try {
      const res = await tc.syncStatus()
      const data = res?.data ?? res ?? {}
      setSyncStatus({
        configured: !!data.configured,
        lastSync: data.lastSync || data.last_sync || null
      })
      setSyncConfig({
        supabaseUrl: data.supabaseUrl || data.supabase_url || '',
        supabaseKey: data.supabaseKey || data.supabase_key || ''
      })
    } catch (err) {
      console.error("Erreur fetchSyncStatus:", err)
    }
  }

  async function fetchSyncValidation() {
    try {
      const res = await tc.validateSyncReady()
      const data = res?.data ?? res ?? {}
      setSyncValidation(data)
    } catch (err) {
      console.error("Erreur fetchSyncValidation:", err)
      setSyncValidation({ ready: false, issues: ['Validation impossible dans l’application.'], configured: false })
    }
  }

  async function handleSaveSyncConfig() {
    if (!syncConfig.supabaseUrl.trim() || !syncConfig.supabaseKey.trim()) {
      return toast.error("L'URL et la clé d'API Supabase sont obligatoires.")
    }
    setSaving(true)
    try {
      await tc.saveSyncConfig(syncConfig.supabaseUrl.trim(), syncConfig.supabaseKey.trim())
      toast.success("Configuration de synchronisation enregistrée avec succès.")
      fetchSyncStatus()
    } catch (err: any) {
      const msg = typeof err === 'string' ? err : (err?.message || err?.error || JSON.stringify(err))
      toast.error(msg || "Erreur lors de l'enregistrement.")
    } finally {
      setSaving(false)
    }
  }

  async function handleRunSync() {
    if (!syncStatus?.configured) {
      toast.error("Configurez d’abord l’URL et la clé API Supabase avant de synchroniser.")
      return
    }

    if (syncValidation && !syncValidation.ready) {
      const issueText = syncValidation.issues?.length ? syncValidation.issues.join(' • ') : 'La base n’est pas prête.'
      toast.error(`Base non prête pour la sync: ${issueText}`)
      return
    }

    setSyncing(true)
    setSyncSummary(null)
    try {
      const res = await tc.syncPush()
      const data = res?.data ?? res ?? {}
      if (data.success) {
        toast.success(data.message || "Synchronisation réussie.")
      } else {
        toast.error(data.message || "La synchronisation a échoué.")
      }
      setSyncSummary(data)
      fetchSyncStatus()
      fetchSyncValidation()
      // Prévenir les pages ouvertes (élèves, classes, encaissements…) qu'elles
      // doivent se rafraîchir après une synchro manuelle (comme le fait la
      // synchro automatique).
      window.dispatchEvent(new Event('sync-completed'))
    } catch (err: any) {
      const msg = typeof err === 'string' ? err : (err?.message || err?.error || (typeof err === 'object' ? JSON.stringify(err) : String(err)))
      toast.error(msg || "Erreur réseau ou connexion Supabase impossible.")
    } finally {
      setSyncing(false)
    }
  }

  async function fetchEcoles() {
    try {
      const response = await tc.listEtablissements()
      const list = response?.etablissements ?? []
      setEcoles(list)
      if (list.length > 0 && !selectedEcole) setSelectedEcole(list[0].id)
    } catch (err: any) {
      console.error("Erreur fetchEcoles:", err)
      setEcoles([])
    }
  }

  async function fetchParametres() {
    if (!selectedEcole) return
    try {
      const res = await tc.getParametres(selectedEcole)
      const data = res?.data ?? res ?? {}
      setConfigForm(prev => ({
        ...prev,
        tauxChangeUsdBif: data.tauxChangeUsdBif != null ? String(data.tauxChangeUsdBif) : prev.tauxChangeUsdBif,
        mentionsLegales: data.mentionsLegales || prev.mentionsLegales,
        piedPageRecu: data.piedPageRecu || prev.piedPageRecu,
        nomImprimante: data.nomImprimante || prev.nomImprimante,
        anneeScolaireId: data.anneeScolaireId || prev.anneeScolaireId,
      }))
    } catch (err: any) {
      console.warn('Paramètres avancés non trouvés (utilisation des défauts) :', err)
    }
  }

  async function fetchAnnees() {
    if (!selectedEcole) { setAnnees([]); return }
    try {
      const res = await tc.listAnneesScolaires(selectedEcole)
      const list = res?.annees_scolaires ?? []
      setAnnees(list)
    } catch (err: any) {
      console.error("Erreur fetchAnnees:", err)
      setAnnees([])
    }
  }

  useEffect(() => {
    if (user) {
      fetchEcoles()
      fetchSyncStatus()
      fetchSyncValidation()
    }
  }, [user])

  useEffect(() => {
    if (!selectedEcole || ecoles.length === 0) return
    const ecole = ecoles.find(e => e.id === selectedEcole)
    if (ecole) {
      setIdentiteForm({
        logo: ecole.logoUrl || '',
        couleurPrimaire: ecole.couleurPrincipale || '#1e3a8a'
      })
      setContactForm({
        nom: ecole.nom || '', telephone: ecole.telephone || '', email: ecole.email || '',
        adresse: ecole.adresse || '', rccm: ecole.rccm || '', idNat: ecole.idNat || ''
      })
    }
    tc.getReceiptLogoPosition()
      .then((res: any) => {
        const pos = (res?.data ?? res)?.position
        if (pos === 'left' || pos === 'center' || pos === 'right') setLogoPosition(pos)
      })
      .catch(() => { /* valeur par défaut : centre */ })
    setLoading(true)
    Promise.all([fetchParametres(), fetchAnnees()]).finally(() => setLoading(false))
  }, [selectedEcole, ecoles])

  if (user && !canManageSettings(user.role || '')) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <ShieldAlert className="w-16 h-16 text-rose-500" />
        <h2 className="text-2xl font-bold text-stone-800">Accès réservé</h2>
        <p className="text-stone-500">La configuration générale est réservée au coordonnateur ou à l'administrateur.</p>
      </motion.div>
    )
  }

  function getSelectedEcoleName() { return ecoles.find((e) => e.id === selectedEcole)?.nom || contactForm.nom || '' }
  function getSelectedAnneeLabel() {
    const anneeId = configForm.anneeScolaireId
    if (!anneeId) return annees.find((a) => a.active)?.libelle || ''
    return annees.find((a) => a.id === anneeId)?.libelle || ''
  }

  function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Logo trop volumineux (max 2 Mo)')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result || '')
      setIdentiteForm((f) => ({ ...f, logo: dataUrl }))
      toast.success('Logo chargé — pensez à enregistrer')
    }
    reader.onerror = () => toast.error('Impossible de lire le fichier')
    reader.readAsDataURL(file)
    // Permet de re-sélectionner le même fichier après suppression
    e.target.value = ''
  }

  async function saveIdentite() {
    setSaving(true)
    try {
      await tc.updateEtablissement(selectedEcole, {
        logoUrl: identiteForm.logo || null,
        couleurPrincipale: identiteForm.couleurPrimaire,
      })
      await tc.saveReceiptLogoPosition(logoPosition)
      toast.success('Identité visuelle mise à jour avec succès')
      fetchEcoles()
    } catch (err: any) { toast.error(err.message || 'Erreur lors de la sauvegarde') }
    finally { setSaving(false) }
  }

  async function saveContact() {
    if (!contactForm.nom.trim()) return toast.error('Le nom de l\'établissement est obligatoire (*)')
    setSaving(true)
    try {
      await tc.updateEtablissement(selectedEcole, {
        nom: contactForm.nom,
        telephone: contactForm.telephone || null,
        email: contactForm.email || null,
        adresse: contactForm.adresse || null,
        rccm: contactForm.rccm || null,
        idNat: contactForm.idNat || null,
      })
      toast.success('Coordonnées mises à jour avec succès')
      fetchEcoles()
    } catch (err: any) { toast.error(err.message || 'Erreur lors de la sauvegarde') }
    finally { setSaving(false) }
  }

  async function saveConfig() {
    setSaving(true)
    try {
      await tc.saveParametres(selectedEcole, {
        anneeScolaireId: configForm.anneeScolaireId || null,
        mentionsLegales: configForm.mentionsLegales || null,
        piedPageRecu: configForm.piedPageRecu || null,
        nomImprimante: configForm.nomImprimante || null,
        tauxChangeUsdBif: configForm.tauxChangeUsdBif ? Number(configForm.tauxChangeUsdBif) : null,
        deviseDefaut: "CDF",
      })
      toast.success('Configuration mise à jour avec succès')
    } catch (err: any) { toast.error(err.message || 'Erreur lors de la sauvegarde') }
    finally { setSaving(false) }
  }

  async function toggleAnneeActive(id: string) {
    try {
      const annee = annees.find((a) => a.id === id)
      if (!annee) return
      await tc.updateAnneeScolaire(id, { active: !annee.active })
      toast.success(annee.active ? 'Année désactivée avec succès' : 'Année activée avec succès')
      fetchAnnees()
    } catch (err: any) { toast.error(err.message || 'Erreur lors de la modification') }
  }

  async function createAnnee() {
    if (!newAnnee.libelle) return toast.error("Veuillez saisir l'année scolaire (*)")
    setSaving(true)
    try {
      await tc.createAnneeScolaire({
        libelle: newAnnee.libelle,
        etablissementId: selectedEcole,
        dateDebut: newAnnee.dateDebut || null,
        dateFin: newAnnee.dateFin || null,
      })
      toast.success('Année scolaire créée avec succès')
      setAnneeDialogOpen(false)
      setNewAnnee({ libelle: '', dateDebut: '', dateFin: '' })
      fetchAnnees()
    } catch (err: any) { toast.error(err.message || 'Erreur lors de la création') }
    finally { setSaving(false) }
  }

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6 p-2 sm:p-4 md:p-6">
      {/* Banner Header */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-stone-200/80 shadow-sm">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-700 text-xs font-bold border border-amber-500/20 mb-2">
            <Settings className="h-3.5 w-3.5" /> Configuration Générale
          </div>
          <h1 className="text-2xl font-extrabold text-stone-900 tracking-tight">Paramètres du Système</h1>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">Identité visuelle, coordonnées, années scolaires, devises et synchronisation Supabase.</p>
        </div>
      </motion.div>

      {/* School Selector */}
      <motion.div variants={itemVariants} className="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-sm">
        <div className="max-w-md">
          <Label className="text-xs font-semibold text-stone-600">Établissement actif pour la configuration *</Label>
          <Select value={selectedEcole} onValueChange={(v) => { setSelectedEcole(v); onEtabSelect(v, ecoles) }}>
            <SelectTrigger className="mt-1 rounded-xl border-stone-200 font-medium">
              <SelectValue placeholder="Sélectionner un établissement" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              {ecoles.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {`${getTypeIcon(e.type || '')} ${e.nom}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </motion.div>

      {/* Tabs */}
      <motion.div variants={itemVariants}>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 mb-6 bg-stone-100 p-1 rounded-xl border border-stone-200">
            <TabsTrigger value="identite" className="gap-1.5 text-xs sm:text-sm rounded-lg font-bold data-[state=active]:bg-[#0c241f] data-[state=active]:text-amber-400">
              <Palette className="w-4 h-4 hidden sm:block" /> Identité visuelle
            </TabsTrigger>
            <TabsTrigger value="coordonnees" className="gap-1.5 text-xs sm:text-sm rounded-lg font-bold data-[state=active]:bg-[#0c241f] data-[state=active]:text-amber-400">
              <MapPin className="w-4 h-4 hidden sm:block" /> Coordonnées
            </TabsTrigger>
            <TabsTrigger value="annees" className="gap-1.5 text-xs sm:text-sm rounded-lg font-bold data-[state=active]:bg-[#0c241f] data-[state=active]:text-amber-400">
              <CalendarDays className="w-4 h-4 hidden sm:block" /> Années scolaires
            </TabsTrigger>
            <TabsTrigger value="configuration" className="gap-1.5 text-xs sm:text-sm rounded-lg font-bold data-[state=active]:bg-[#0c241f] data-[state=active]:text-amber-400">
              <Settings className="w-4 h-4 hidden sm:block" /> Configuration
            </TabsTrigger>
            <TabsTrigger value="synchronisation" className="gap-1.5 text-xs sm:text-sm rounded-lg font-bold data-[state=active]:bg-[#0c241f] data-[state=active]:text-amber-400">
              <RefreshCw className="w-4 h-4 hidden sm:block" /> Synchronisation
            </TabsTrigger>
          </TabsList>

          {/* ═══ Onglet Identité Visuelle ═══ */}
          <TabsContent value="identite">
            <Card className="rounded-2xl border-stone-200/80 shadow-sm overflow-hidden">
              <CardHeader className="bg-stone-50/50 border-b border-stone-100 px-6 py-4">
                <CardTitle className="text-sm font-bold text-[#0c241f] flex items-center gap-2">
                  <Palette className="w-5 h-5 text-amber-600" /> Identité Visuelle & Couleurs
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                {loading ? (
                  <div className="space-y-4"><Skeleton className="h-40 w-60 rounded-xl" /><Skeleton className="h-10 w-full rounded-xl" /></div>
                ) : (
                  <div className="space-y-6">
                    <div>
                      <Label className="text-xs font-semibold text-stone-600">Logo de l&apos;établissement</Label>
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/svg+xml,image/webp"
                        className="hidden"
                        onChange={handleLogoFile}
                      />
                      <div
                        onClick={() => logoInputRef.current?.click()}
                        className="border-2 border-dashed border-stone-300 rounded-2xl p-6 flex flex-col items-center gap-3 hover:border-[#1e3a8a] transition-colors cursor-pointer bg-stone-50/50 mt-1"
                      >
                        {identiteForm.logo ? (
                          <div className="flex flex-col items-center gap-3">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={identiteForm.logo}
                              alt="Aperçu du logo"
                              className="h-20 w-20 rounded-xl border border-stone-200 bg-white object-contain p-1 shadow-sm"
                            />
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 border border-emerald-200 font-semibold">Logo chargé</Badge>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setIdentiteForm((f) => ({ ...f, logo: '' })) }}
                                className="text-[11px] font-bold text-rose-600 hover:text-rose-700 underline underline-offset-2"
                              >
                                Retirer
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <Upload className="w-10 h-10 text-stone-400" />
                            <p className="text-xs font-semibold text-stone-600">Cliquez pour télécharger le logo officiel</p>
                            <p className="text-[11px] text-stone-400">PNG, JPG, SVG — Max 2 Mo</p>
                          </>
                        )}
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs font-semibold text-stone-600">Position du logo sur le reçu</Label>
                      <div className="flex gap-2 mt-1">
                        {([
                          ['left', 'Gauche'],
                          ['center', 'Centre'],
                          ['right', 'Droite'],
                        ] as const).map(([val, label]) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => setLogoPosition(val)}
                            className={`flex-1 rounded-xl border px-3 py-2 text-xs font-bold transition-all ${
                              logoPosition === val
                                ? 'border-[#1e3a8a] bg-blue-50 text-[#1e3a8a] shadow-sm'
                                : 'border-stone-200 bg-white text-stone-500 hover:bg-stone-50'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <p className="text-[11px] text-stone-400 mt-1">Le logo apparaîtra en haut du reçu de paiement, aligné comme choisi.</p>
                    </div>
                    <div>
                      <Label htmlFor="couleurPrimaire" className="text-xs font-semibold text-stone-600">Couleur thématique principale</Label>
                      <div className="flex items-center gap-3 mt-1">
                        <input id="couleurPrimaire" type="color" value={identiteForm.couleurPrimaire} onChange={(e) => setIdentiteForm({ ...identiteForm, couleurPrimaire: e.target.value })} className="w-14 h-10 rounded-xl cursor-pointer border border-stone-200 bg-transparent p-1" />
                        <Input value={identiteForm.couleurPrimaire} onChange={(e) => setIdentiteForm({ ...identiteForm, couleurPrimaire: e.target.value })} className="w-36 font-mono font-bold rounded-xl border-stone-200" placeholder="#0c241f" />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs font-semibold text-stone-600">Aperçu du thème</Label>
                      <div className="flex items-center gap-4 mt-1">
                        <div className="w-32 h-20 rounded-2xl border border-stone-200 shadow-sm" style={{ backgroundColor: identiteForm.couleurPrimaire }} />
                        <div className="flex-1 h-20 rounded-2xl border border-stone-200 shadow-sm p-4 flex flex-col justify-center" style={{ backgroundColor: identiteForm.couleurPrimaire, color: '#ffffff' }}>
                          <span className="text-xs opacity-80 font-medium">Exemple de carte</span>
                          <span className="text-base font-extrabold break-words">{getSelectedEcoleName() || 'Mon École'}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end pt-2 border-t border-stone-100">
                      <Button onClick={saveIdentite} disabled={saving} className="bg-[#0c241f] hover:bg-[#071916] text-white font-bold rounded-xl px-6 shadow-md gap-2">
                        <Save className="w-4 h-4 text-amber-400" /> {saving ? 'Enregistrement...' : 'Sauvegarder'}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══ Onglet Coordonnées ═══ */}
          <TabsContent value="coordonnees">
            <Card className="rounded-2xl border-stone-200/80 shadow-sm overflow-hidden">
              <CardHeader className="bg-stone-50/50 border-b border-stone-100 px-6 py-4">
                <CardTitle className="text-sm font-bold text-[#0c241f] flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-amber-600" /> Coordonnées Officielles
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                {loading ? (
                  <div className="space-y-4">
                    {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-xl" />)}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="nom-etab" className="text-xs font-semibold text-stone-600">Nom de l&apos;établissement *</Label>
                      <Input id="nom-etab" placeholder="Ex: Complexe Scolaire AGAPE" value={contactForm.nom} onChange={(e) => setContactForm({ ...contactForm, nom: e.target.value })} className="rounded-xl border-stone-200 bg-white font-bold mt-1" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="tel" className="text-xs font-semibold text-stone-600">Téléphone</Label>
                        <Input id="tel" placeholder="+243 xxx xxx xxx" value={contactForm.telephone} onChange={(e) => setContactForm({ ...contactForm, telephone: e.target.value })} className="rounded-xl border-stone-200 bg-white font-medium mt-1" />
                      </div>
                      <div>
                        <Label htmlFor="email" className="text-xs font-semibold text-stone-600">Email professionnel</Label>
                        <Input id="email" type="email" placeholder="contact@ecole.cd" value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} className="rounded-xl border-stone-200 bg-white font-medium mt-1" />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="adresse" className="text-xs font-semibold text-stone-600">Adresse physique</Label>
                      <Input id="adresse" placeholder="N° XX, Avenue ..., Quartier ..., Commune ..." value={contactForm.adresse} onChange={(e) => setContactForm({ ...contactForm, adresse: e.target.value })} className="rounded-xl border-stone-200 bg-white font-medium mt-1" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="rccm" className="text-xs font-semibold text-stone-600">Numéro RCCM</Label>
                        <Input id="rccm" placeholder="N° RCCM" value={contactForm.rccm} onChange={(e) => setContactForm({ ...contactForm, rccm: e.target.value })} className="rounded-xl border-stone-200 bg-white font-medium mt-1" />
                      </div>
                      <div>
                        <Label htmlFor="idnat" className="text-xs font-semibold text-stone-600">ID. NAT</Label>
                        <Input id="idnat" placeholder="N° Identifiant National" value={contactForm.idNat} onChange={(e) => setContactForm({ ...contactForm, idNat: e.target.value })} className="rounded-xl border-stone-200 bg-white font-medium mt-1" />
                      </div>
                    </div>
                    <div className="flex justify-end pt-3 border-t border-stone-100">
                      <Button onClick={saveContact} disabled={saving} className="bg-[#0c241f] hover:bg-[#071916] text-white font-bold rounded-xl px-6 shadow-md gap-2">
                        <Save className="w-4 h-4 text-amber-400" /> {saving ? 'Enregistrement...' : 'Sauvegarder'}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══ Onglet Années Scolaires ═══ */}
          <TabsContent value="annees">
            <Card className="rounded-2xl border-stone-200/80 shadow-sm overflow-hidden">
              <CardHeader className="bg-stone-50/50 border-b border-stone-100 px-6 py-4 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-bold text-[#0c241f] flex items-center gap-2">
                  <CalendarDays className="w-5 h-5 text-amber-600" /> Années Scolaires Configuées
                </CardTitle>
                <Button onClick={() => setAnneeDialogOpen(true)} className="bg-[#0c241f] hover:bg-[#071916] text-white font-bold rounded-xl gap-2" size="sm">
                  <Plus className="w-4 h-4 text-amber-400" /> Nouvelle année
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {loading ? (
                  <div className="p-6 space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}</div>
                ) : annees.length === 0 ? (
                  <div className="p-12 text-center text-stone-400">
                    <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="font-bold text-stone-700">Aucune année scolaire configurée.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader className="bg-[#0c241f] text-white">
                      <TableRow className="hover:bg-[#0c241f]">
                        <TableHead className="text-amber-300 font-bold">Année Scolaire</TableHead>
                        <TableHead className="text-white font-bold">Date Début</TableHead>
                        <TableHead className="text-white font-bold">Date Fin</TableHead>
                        <TableHead className="text-white font-bold">Statut</TableHead>
                        <TableHead className="text-right text-white font-bold">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {annees.map((a) => (
                        <TableRow key={a.id} className="hover:bg-amber-500/5 transition-colors">
                          <TableCell className="font-extrabold text-stone-900">{a.libelle}</TableCell>
                          <TableCell className="font-medium text-stone-600">{a.dateDebut ? new Date(a.dateDebut).toLocaleDateString('fr-FR') : '—'}</TableCell>
                          <TableCell className="font-medium text-stone-600">{a.dateFin ? new Date(a.dateFin).toLocaleDateString('fr-FR') : '—'}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={a.active ? 'bg-emerald-100 text-emerald-800 border border-emerald-200 font-semibold' : 'bg-stone-100 text-stone-700'}>
                              {a.active ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" onClick={() => toggleAnneeActive(a.id)} className={`gap-1.5 font-semibold ${a.active ? 'text-rose-600 hover:bg-rose-50' : 'text-emerald-700 hover:bg-emerald-50'}`}>
                              {a.active ? <><ToggleRight className="w-5 h-5" /> Désactiver</> : <><ToggleLeft className="w-5 h-5" /> Activer</>}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══ Onglet Configuration ═══ */}
          <TabsContent value="configuration">
            <Card className="rounded-2xl border-stone-200/80 shadow-sm overflow-hidden">
              <CardHeader className="bg-stone-50/50 border-b border-stone-100 px-6 py-4">
                <CardTitle className="text-sm font-bold text-[#0c241f] flex items-center gap-2">
                  <Settings className="w-5 h-5 text-amber-600" /> Configuration des Reçus & Impresse
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                {loading ? (
                  <div className="space-y-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-xl" />)}</div>
                ) : (
                  <div className="space-y-5">
                    <div>
                      <Label htmlFor="annee-active" className="text-xs font-semibold text-stone-600">Année scolaire active pour l&apos;établissement *</Label>
                      <Select value={configForm.anneeScolaireId} onValueChange={(v) => setConfigForm({ ...configForm, anneeScolaireId: v })}>
                        <SelectTrigger className="rounded-xl border-stone-200 bg-white font-medium mt-1"><SelectValue placeholder="Choisir une année" /></SelectTrigger>
                        <SelectContent className="rounded-xl">
                          {annees.map((a) => (<SelectItem key={a.id} value={a.id}>{a.libelle} {a.active ? '• Active' : ''}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="taux-change" className="text-xs font-semibold text-stone-600">Taux de change (1 USD = X CDF) *</Label>
                        <Input id="taux-change" type="number" min="0" placeholder="Ex: 2900" value={configForm.tauxChangeUsdBif} onChange={(e) => setConfigForm({ ...configForm, tauxChangeUsdBif: e.target.value })} className="rounded-xl border-stone-200 bg-white font-bold text-stone-900 mt-1" />
                      </div>
                      <div>
                        <Label htmlFor="imprimante" className="text-xs font-semibold text-stone-600">Nom de l&apos;imprimante thermique</Label>
                        <Input id="imprimante" placeholder="Ex: EPSON TM-T20III" value={configForm.nomImprimante} onChange={(e) => setConfigForm({ ...configForm, nomImprimante: e.target.value })} className="rounded-xl border-stone-200 bg-white font-medium mt-1" />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="mentions-legales" className="text-xs font-semibold text-stone-600">Mentions légales imprimées</Label>
                      <textarea id="mentions-legales" className="flex min-h-[90px] w-full rounded-2xl border border-stone-200 bg-white px-3 py-2 text-xs font-medium mt-1" placeholder="Entrez les mentions légales..." value={configForm.mentionsLegales} onChange={(e) => setConfigForm({ ...configForm, mentionsLegales: e.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="pied-page" className="text-xs font-semibold text-stone-600">Pied de page des reçus POS</Label>
                      <textarea id="pied-page" className="flex min-h-[80px] w-full rounded-2xl border border-stone-200 bg-white px-3 py-2 text-xs font-medium mt-1" placeholder="Texte affiché en bas des reçus..." value={configForm.piedPageRecu} onChange={(e) => setConfigForm({ ...configForm, piedPageRecu: e.target.value })} />
                    </div>
                    <div className="flex justify-end pt-3 border-t border-stone-100">
                      <Button onClick={saveConfig} disabled={saving} className="bg-[#0c241f] hover:bg-[#071916] text-white font-bold rounded-xl px-6 shadow-md gap-2">
                        <Save className="w-4 h-4 text-amber-400" /> {saving ? 'Enregistrement...' : 'Sauvegarder'}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══ Onglet Synchronisation ═══ */}
          <TabsContent value="synchronisation">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Configuration Column */}
              <Card className="lg:col-span-1 rounded-2xl border-stone-200/80 shadow-sm overflow-hidden">
                <CardHeader className="bg-stone-50/50 border-b border-stone-100 px-6 py-4">
                  <CardTitle className="text-sm font-bold text-[#0c241f] flex items-center gap-2">
                    <Globe className="w-5 h-5 text-amber-600" /> Connexion Supabase
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  <div>
                    <Label className="text-xs font-semibold text-stone-600">URL de l&apos;API Supabase *</Label>
                    <Input
                      placeholder="https://xyz.supabase.co"
                      value={syncConfig.supabaseUrl}
                      onChange={(e) => setSyncConfig({ ...syncConfig, supabaseUrl: e.target.value })}
                      className="rounded-xl border-stone-200 bg-white font-mono text-xs mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-stone-600">Clé d&apos;API Supabase (Service Role / Anon) *</Label>
                    <Input
                      type="password"
                      placeholder="eyJhbGciOiJIUzI1NiIsInR..."
                      value={syncConfig.supabaseKey}
                      onChange={(e) => setSyncConfig({ ...syncConfig, supabaseKey: e.target.value })}
                      className="rounded-xl border-stone-200 bg-white font-mono text-xs mt-1"
                    />
                  </div>
                  <Button
                    onClick={handleSaveSyncConfig}
                    disabled={saving || syncing}
                    className="w-full bg-[#0c241f] hover:bg-[#071916] text-white font-bold rounded-xl h-11 shadow-md gap-2"
                  >
                    <Save className="w-4 h-4 text-amber-400" /> Enregistrer les Identifiants
                  </Button>
                </CardContent>
              </Card>

              {/* Status and Action Column */}
              <Card className="lg:col-span-2 rounded-2xl border-stone-200/80 shadow-sm overflow-hidden">
                <CardHeader className="bg-stone-50/50 border-b border-stone-100 px-6 py-4">
                  <CardTitle className="text-sm font-bold text-[#0c241f] flex items-center gap-2">
                    <RefreshCw className="w-5 h-5 text-amber-600" /> Synchronisation Bidirectionnelle
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  {syncStatus ? (
                    <div className="flex flex-col gap-4 p-5 rounded-2xl bg-stone-50 border border-stone-200">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-stone-700">Statut de la connexion :</span>
                            {syncStatus.configured ? (
                              <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-200 font-semibold gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Configuré</Badge>
                            ) : (
                              <Badge variant="destructive" className="gap-1 font-semibold"><AlertCircle className="w-3.5 h-3.5" /> Non configuré</Badge>
                            )}
                          </div>
                          <p className="text-xs text-stone-500 mt-1.5 font-medium">
                            Dernière synchronisation réussie : <b className="text-stone-800">{syncStatus.lastSync ? new Date(syncStatus.lastSync).toLocaleString('fr-FR') : "Jamais"}</b>
                          </p>
                        </div>

                        <Button
                          onClick={handleRunSync}
                          disabled={!syncStatus.configured || syncing || saving || !!(syncValidation && !syncValidation.ready)}
                          className="bg-[#d97706] hover:bg-[#b45309] text-white font-bold rounded-xl h-11 px-6 shadow-md gap-2"
                        >
                          {syncing ? (
                            <><Loader2 className="w-4 h-4 animate-spin" /> Synchronisation...</>
                          ) : (
                            <><RefreshCw className="w-4 h-4" /> Lancer la Synchro</>
                          )}
                        </Button>
                      </div>

                      {syncValidation && (
                        <div className={`rounded-xl border p-3 text-xs ${syncValidation.ready ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                          <div className="flex items-center gap-2 font-bold">
                            {syncValidation.ready ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                            {syncValidation.message || 'Validation de la base locale'}
                          </div>
                          {syncValidation.issues?.length ? (
                            <ul className="mt-2 list-disc list-inside space-y-1 opacity-90">
                              {syncValidation.issues.slice(0, 3).map((issue: string, idx: number) => (
                                <li key={idx}>{issue}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-2 opacity-90">Aucune anomalie détectée dans la structure et les données locales.</p>
                          )}
                          {syncValidation.warnings?.length ? (
                            <ul className="mt-2 list-disc list-inside space-y-1 opacity-90 text-amber-700">
                              {syncValidation.warnings.slice(0, 4).map((w: string, idx: number) => (
                                <li key={idx}>{w}</li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      )}

                      {syncStatus.configured && (
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <Badge variant="outline" className="bg-emerald-50 border-emerald-200 text-emerald-800 gap-1 font-semibold">
                            <RefreshCw className="w-3 h-3 text-emerald-600" /> Synchro automatique activée (toutes les 5 min)
                          </Badge>
                          <Badge variant="outline" className="bg-amber-50 border-amber-200 text-amber-800 gap-1 font-semibold">
                            <Database className="w-3 h-3 text-amber-600" /> Rétention AuditLog : max 200 entrées
                          </Badge>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex justify-center p-4"><Loader2 className="w-6 h-6 animate-spin text-stone-400" /></div>
                  )}

                  {/* Sync Summary Section */}
                  {syncSummary && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                      <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider flex items-center gap-1.5"><Database className="w-4 h-4 text-[#0c241f]" /> Rapport de synchronisation</h3>
                      <div className="max-h-[220px] overflow-y-auto border border-stone-200 rounded-2xl overflow-hidden">
                        <Table>
                          <TableHeader className="sticky top-0 bg-[#0c241f] text-white z-10">
                            <TableRow className="hover:bg-[#0c241f]">
                              <TableHead className="text-amber-300 font-bold">Table</TableHead>
                              <TableHead className="text-center text-sky-300 font-bold">Poussés ↑</TableHead>
                              <TableHead className="text-center text-emerald-300 font-bold">Rapatriés ↓</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {syncSummary.stats.map((stat: any) => (
                              <TableRow key={stat.table_name} className={stat.pushed > 0 || stat.pulled > 0 ? "bg-emerald-50/50 font-bold" : "opacity-60"}>
                                <TableCell className="py-2.5 text-xs font-bold text-stone-800 break-words">{stat.table_name}</TableCell>
                                <TableCell className="text-center text-sky-700 py-2.5 text-xs font-extrabold">{stat.pushed}</TableCell>
                                <TableCell className="text-center text-emerald-700 py-2.5 text-xs font-extrabold">{stat.pulled}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </motion.div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </motion.div>

      {/* Dialogue Nouvelle Année */}
      <Dialog open={anneeDialogOpen} onOpenChange={setAnneeDialogOpen}>
        <DialogContent className="max-w-md bg-white p-6 sm:p-8 rounded-3xl border border-stone-200 shadow-2xl">
          <DialogHeader className="border-b border-stone-100 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-[#0c241f] text-amber-400">
                <CalendarDays className="h-6 w-6" />
              </div>
              <div>
                <DialogTitle className="text-xl font-extrabold text-[#0c241f]">Nouvelle année scolaire</DialogTitle>
                <p className="text-xs text-stone-500 font-medium">Définissez la période scolaire.</p>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-4 pt-3">
            <div>
              <Label htmlFor="new-annee" className="text-xs font-semibold text-stone-600">Année scolaire *</Label>
              <Input id="new-annee" placeholder="Ex: 2024-2025" value={newAnnee.libelle} onChange={(e) => setNewAnnee({ ...newAnnee, libelle: e.target.value })} className="rounded-xl border-stone-200 bg-white font-bold mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="date-debut" className="text-xs font-semibold text-stone-600">Date début</Label>
                <Input id="date-debut" type="date" value={newAnnee.dateDebut} onChange={(e) => setNewAnnee({ ...newAnnee, dateDebut: e.target.value })} className="rounded-xl border-stone-200 bg-white font-medium mt-1" />
              </div>
              <div>
                <Label htmlFor="date-fin" className="text-xs font-semibold text-stone-600">Date fin</Label>
                <Input id="date-fin" type="date" value={newAnnee.dateFin} onChange={(e) => setNewAnnee({ ...newAnnee, dateFin: e.target.value })} className="rounded-xl border-stone-200 bg-white font-medium mt-1" />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-stone-100">
              <Button variant="outline" className="rounded-xl border-stone-200" onClick={() => setAnneeDialogOpen(false)}>Annuler</Button>
              <Button onClick={createAnnee} disabled={saving} className="bg-[#0c241f] hover:bg-[#071916] text-white font-bold rounded-xl px-6 shadow-md">
                {saving ? 'Création...' : 'Créer l’année'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}