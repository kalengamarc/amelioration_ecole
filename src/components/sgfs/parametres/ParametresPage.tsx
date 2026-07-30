'use client'

import { useState, useEffect } from 'react'
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
  AlertCircle, Loader2
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

  const [identiteForm, setIdentiteForm] = useState({ logo: '', couleurPrimaire: '#075e54' })
  const [contactForm, setContactForm] = useState({ nom: '', telephone: '', email: '', adresse: '', rccm: '', idNat: '' })
  const [annees, setAnnees] = useState<AnneeScolaire[]>([])
  const [newAnnee, setNewAnnee] = useState({ libelle: '', dateDebut: '', dateFin: '' })
  const [anneeDialogOpen, setAnneeDialogOpen] = useState(false)
  const [configForm, setConfigForm] = useState({ tauxChangeUsdBif: '', mentionsLegales: '', piedPageRecu: '', nomImprimante: '', anneeScolaireId: '' })

  const [syncConfig, setSyncConfig] = useState({ supabaseUrl: '', supabaseKey: '' })
  const [syncStatus, setSyncStatus] = useState<{ configured: boolean; lastSync: string | null } | null>(null)
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

  async function handleSaveSyncConfig() {
    if (!syncConfig.supabaseUrl.trim() || !syncConfig.supabaseKey.trim()) {
      return toast.error("L'URL et la clé d'API Supabase sont obligatoires.")
    }
    setSaving(true)
    try {
      await tc.saveSyncConfig(syncConfig.supabaseUrl.trim(), syncConfig.supabaseKey.trim())
      toast.success("Configuration de synchronisation enregistrée.")
      fetchSyncStatus()
    } catch (err: any) {
      const msg = typeof err === 'string' ? err : (err?.message || err?.error || JSON.stringify(err))
      toast.error(msg || "Erreur lors de l'enregistrement.")
    } finally {
      setSaving(false)
    }
  }

  async function handleRunSync() {
    setSyncing(true)
    setSyncSummary(null)
    try {
      const res = await tc.syncPush()
      const data = res?.data ?? res ?? {}
      if (data.success) {
        toast.success(data.message || "Synchronisation réussie.")
        setSyncSummary(data)
        fetchSyncStatus()
      } else {
        toast.error(data.message || "La synchronisation a échoué.")
      }
    } catch (err: any) {
      const msg = typeof err === 'string' ? err : (err?.message || err?.error || (typeof err === 'object' ? JSON.stringify(err) : String(err)))
      toast.error(msg || "Erreur réseau ou connexion Supabase impossible.")
    } finally {
      setSyncing(false)
    }
  }

  // ── Fetch Établissements ─────────────────────────────────────────────────
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

  // ── Fetch Paramètres ──────────────────────────────────────────────────────
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

  // ── Fetch Années Scolaires ────────────────────────────────────────────────
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
    }
  }, [user])

  useEffect(() => {
    if (!selectedEcole || ecoles.length === 0) return
    const ecole = ecoles.find(e => e.id === selectedEcole)
    if (ecole) {
      setIdentiteForm({
        logo: ecole.logoUrl || '',
        couleurPrimaire: ecole.couleurPrincipale || '#11ceb8'
      })
      setContactForm({
        nom: ecole.nom || '', telephone: ecole.telephone || '', email: ecole.email || '',
        adresse: ecole.adresse || '', rccm: ecole.rccm || '', idNat: ecole.idNat || ''
      })
    }
    setLoading(true)
    Promise.all([fetchParametres(), fetchAnnees()]).finally(() => setLoading(false))
  }, [selectedEcole, ecoles])

  // ── Permission Guard ──────────────────────────────────────────────────────
  if (user && !canManageSettings(user.role || '')) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <ShieldAlert className="w-16 h-16 text-red-400" />
        <h2 className="text-2xl font-bold text-gray-700">Accès réservé</h2>
        <p className="text-gray-500">Accès réservé au coordonnateur ou à l'administrateur</p>
      </motion.div>
    )
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function getSelectedEcoleName() { return ecoles.find((e) => e.id === selectedEcole)?.nom || contactForm.nom || '' }
  function getSelectedAnneeLabel() {
    const anneeId = configForm.anneeScolaireId
    if (!anneeId) return annees.find((a) => a.active)?.libelle || ''
    return annees.find((a) => a.id === anneeId)?.libelle || ''
  }

  // ── Sauvegardes ──────────────────────────────────────────────────────────
  async function saveIdentite() {
    setSaving(true)
    try {
      await tc.updateEtablissement(selectedEcole, {
        logoUrl: identiteForm.logo || null,
        couleurPrincipale: identiteForm.couleurPrimaire,
      })
      toast.success('Identité visuelle mise à jour')
      fetchEcoles()
    } catch (err: any) { toast.error(err.message || 'Erreur lors de la sauvegarde') }
    finally { setSaving(false) }
  }

  async function saveContact() {
    if (!contactForm.nom.trim()) return toast.error('Le nom de l\'établissement est obligatoire')
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
      toast.success('Coordonnées mises à jour')
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
      toast.success('Configuration mise à jour')
    } catch (err: any) { toast.error(err.message || 'Erreur lors de la sauvegarde') }
    finally { setSaving(false) }
  }

  async function toggleAnneeActive(id: string) {
    try {
      const annee = annees.find((a) => a.id === id)
      if (!annee) return
      await tc.updateAnneeScolaire(id, { active: !annee.active })
      toast.success(annee.active ? 'Année désactivée' : 'Année activée')
      fetchAnnees()
    } catch (err: any) { toast.error(err.message || 'Erreur lors de la modification') }
  }

  async function createAnnee() {
    if (!newAnnee.libelle) return toast.error("Veuillez saisir l'année scolaire")
    setSaving(true)
    try {
      await tc.createAnneeScolaire({
        libelle: newAnnee.libelle,
        etablissementId: selectedEcole,
        dateDebut: newAnnee.dateDebut || null,
        dateFin: newAnnee.dateFin || null,
      })
      toast.success('Année scolaire créée')
      setAnneeDialogOpen(false)
      setNewAnnee({ libelle: '', dateDebut: '', dateFin: '' })
      fetchAnnees()
    } catch (err: any) { toast.error(err.message || 'Erreur lors de la création') }
    finally { setSaving(false) }
  }

  // ── Rendu ─────────────────────────────────────────────────────────────────
  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <motion.div variants={itemVariants}>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Paramètres du Système</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Configurez les paramètres généraux et spécifiques par établissement</p>
      </motion.div>

      {/* School Selector */}
      <motion.div variants={itemVariants}>
        <div className="max-w-sm">
          <Label>Établissement</Label>
          <Select value={selectedEcole} onValueChange={(v) => { setSelectedEcole(v); onEtabSelect(v, ecoles) }}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Sélectionner un établissement" />
            </SelectTrigger>
            <SelectContent>
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
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 mb-6">
            <TabsTrigger value="identite" className="gap-1.5 text-xs sm:text-sm">
              <Palette className="w-4 h-4 hidden sm:block" /> Identité visuelle
            </TabsTrigger>
            <TabsTrigger value="coordonnees" className="gap-1.5 text-xs sm:text-sm">
              <MapPin className="w-4 h-4 hidden sm:block" /> Coordonnées
            </TabsTrigger>
            <TabsTrigger value="annees" className="gap-1.5 text-xs sm:text-sm">
              <CalendarDays className="w-4 h-4 hidden sm:block" /> Années scolaires
            </TabsTrigger>
            <TabsTrigger value="configuration" className="gap-1.5 text-xs sm:text-sm">
              <Settings className="w-4 h-4 hidden sm:block" /> Configuration
            </TabsTrigger>
            <TabsTrigger value="synchronisation" className="gap-1.5 text-xs sm:text-sm">
              <RefreshCw className="w-4 h-4 hidden sm:block" /> Synchronisation
            </TabsTrigger>
          </TabsList>

          {/* ═══ Onglet Identité Visuelle ═══ */}
          <TabsContent value="identite">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2" style={{ color: 'var(--etab-color, #075e54)' }}>
                  <Palette className="w-5 h-5" /> Identité visuelle
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-4"><Skeleton className="h-40 w-60" /><Skeleton className="h-10 w-full" /></div>
                ) : (
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <Label>Logo de l&apos;établissement</Label>
                      <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 flex flex-col items-center gap-3 hover:border-[var(--etab-color,#075e54)] transition-colors cursor-pointer">
                        <Upload className="w-10 h-10 text-gray-400" />
                        <p className="text-sm text-gray-500">Cliquez ou glissez pour télécharger le logo</p>
                        <p className="text-xs text-gray-400">PNG, JPG, SVG — Max 2 Mo</p>
                        {identiteForm.logo && <Badge variant="secondary" className="bg-green-100 text-green-700">Logo actuel</Badge>}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="couleurPrimaire">Couleur principale</Label>
                      <div className="flex items-center gap-3">
                        <input id="couleurPrimaire" type="color" value={identiteForm.couleurPrimaire} onChange={(e) => setIdentiteForm({ ...identiteForm, couleurPrimaire: e.target.value })} className="w-12 h-10 rounded cursor-pointer border-0" />
                        <Input value={identiteForm.couleurPrimaire} onChange={(e) => setIdentiteForm({ ...identiteForm, couleurPrimaire: e.target.value })} className="w-36 font-mono" placeholder="#075e54" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-400">Aperçu de la couleur</Label>
                      <div className="flex items-center gap-4">
                        <div className="w-32 h-20 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm" style={{ backgroundColor: identiteForm.couleurPrimaire }} />
                        <div className="flex-1 h-20 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-4 flex flex-col justify-center" style={{ backgroundColor: identiteForm.couleurPrimaire, color: '#ffffff' }}>
                          <span className="text-xs opacity-80">Texte exemple</span>
                          <span className="text-base font-bold">{getSelectedEcoleName() || 'Mon École'}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button onClick={saveIdentite} disabled={saving} className="bg-[var(--etab-color,#075e54)] hover:bg-[var(--etab-color-hover,#064e46)] text-white gap-2">
                        <Save className="w-4 h-4" /> {saving ? 'Enregistrement...' : 'Sauvegarder'}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══ Onglet Coordonnées ═══ */}
          <TabsContent value="coordonnees">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2" style={{ color: 'var(--etab-color, #075e54)' }}>
                  <MapPin className="w-5 h-5" /> Coordonnées de l&apos;établissement
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-4">
                    {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="nom-etab">Nom de l&apos;établissement</Label>
                      <div className="relative">
                        <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input id="nom-etab" placeholder="Ex: Complexe Scolaire ABC" value={contactForm.nom} onChange={(e) => setContactForm({ ...contactForm, nom: e.target.value })} className="pl-9 font-semibold" />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="tel">Téléphone</Label>
                        <Input id="tel" placeholder="+243 xxx xxx xxx" value={contactForm.telephone} onChange={(e) => setContactForm({ ...contactForm, telephone: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input id="email" type="email" placeholder="contact@ecole.cd" value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="adresse">Adresse</Label>
                      <Input id="adresse" placeholder="N° XX, Avenue ..., Quartier ..., Commune ..." value={contactForm.adresse} onChange={(e) => setContactForm({ ...contactForm, adresse: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="rccm">RCCM</Label>
                        <Input id="rccm" placeholder="N° RCCM" value={contactForm.rccm} onChange={(e) => setContactForm({ ...contactForm, rccm: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="idnat">ID. NAT</Label>
                        <Input id="idnat" placeholder="N° Identifiant National" value={contactForm.idNat} onChange={(e) => setContactForm({ ...contactForm, idNat: e.target.value })} />
                      </div>
                    </div>
                    <div className="flex justify-end pt-2">
                      <Button onClick={saveContact} disabled={saving} className="bg-[var(--etab-color,#075e54)] hover:bg-[var(--etab-color-hover,#064e46)] text-white gap-2">
                        <Save className="w-4 h-4" /> {saving ? 'Enregistrement...' : 'Sauvegarder'}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══ Onglet Années Scolaires ═══ */}
          <TabsContent value="annees">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2" style={{ color: 'var(--etab-color, #075e54)' }}>
                  <CalendarDays className="w-5 h-5" /> Années scolaires
                </CardTitle>
                <Button onClick={() => setAnneeDialogOpen(true)} className="bg-[var(--etab-color,#075e54)] hover:bg-[var(--etab-color-hover,#064e46)] text-white gap-2" size="sm">
                  <Plus className="w-4 h-4" /> Nouvelle année
                </Button>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
                ) : annees.length === 0 ? (
                  <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                    <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>Aucune année scolaire configurée</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50 dark:bg-gray-800/50">
                        <TableHead>Année scolaire</TableHead>
                        <TableHead>Date début</TableHead>
                        <TableHead>Date fin</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {annees.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="font-semibold">{a.libelle}</TableCell>
                          <TableCell>{a.dateDebut ? new Date(a.dateDebut).toLocaleDateString('fr-FR') : '—'}</TableCell>
                          <TableCell>{a.dateFin ? new Date(a.dateFin).toLocaleDateString('fr-FR') : '—'}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={a.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}>
                              {a.active ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" onClick={() => toggleAnneeActive(a.id)} className={`gap-1.5 ${a.active ? 'text-red-500 hover:text-red-700 hover:bg-red-50' : 'text-green-500 hover:text-green-700 hover:bg-green-50'}`}>
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
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2" style={{ color: 'var(--etab-color, #075e54)' }}>
                  <Settings className="w-5 h-5" /> Configuration générale
                </CardTitle>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-sm px-3 py-1" style={{ borderColor: identiteForm.couleurPrimaire, color: identiteForm.couleurPrimaire }}>
                    <Building2 className="w-3.5 h-3.5 mr-1.5" /> {getSelectedEcoleName()}
                  </Badge>
                  {getSelectedAnneeLabel() && (
                    <Badge variant="secondary" className="text-sm px-3 py-1">
                      <CalendarDays className="w-3.5 h-3.5 mr-1.5" /> {getSelectedAnneeLabel()}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
                ) : (
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="annee-active">Année scolaire active (pour les paramètres)</Label>
                      <Select value={configForm.anneeScolaireId} onValueChange={(v) => setConfigForm({ ...configForm, anneeScolaireId: v })}>
                        <SelectTrigger><SelectValue placeholder="Choisir une année" /></SelectTrigger>
                        <SelectContent>
                          {annees.map((a) => (<SelectItem key={a.id} value={a.id}>{a.libelle} {a.active ? '• Active' : ''}</SelectItem>))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-gray-400">Sera utilisée pour les documents et calculs par défaut.</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="taux-change">Taux de change USD → CDF</Label>
                        <Input id="taux-change" type="number" min="0" placeholder="Ex: 2900" value={configForm.tauxChangeUsdBif} onChange={(e) => setConfigForm({ ...configForm, tauxChangeUsdBif: e.target.value })} />
                        <p className="text-xs text-gray-400">Utilisé pour les conversions automatiques</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="imprimante">Nom de l&apos;imprimante</Label>
                        <Input id="imprimante" placeholder="Ex: EPSON TM-T20III" value={configForm.nomImprimante} onChange={(e) => setConfigForm({ ...configForm, nomImprimante: e.target.value })} />
                        <p className="text-xs text-gray-400">Imprimante par défaut pour les reçus</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="mentions-legales">Mentions légales</Label>
                      <textarea id="mentions-legales" className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y" placeholder="Entrez les mentions légales..." value={configForm.mentionsLegales} onChange={(e) => setConfigForm({ ...configForm, mentionsLegales: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pied-page">Pied de page des reçus</Label>
                      <textarea id="pied-page" className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y" placeholder="Texte affiché en bas des reçus..." value={configForm.piedPageRecu} onChange={(e) => setConfigForm({ ...configForm, piedPageRecu: e.target.value })} />
                    </div>
                    <div className="flex justify-end pt-2">
                      <Button onClick={saveConfig} disabled={saving} className="bg-[var(--etab-color,#075e54)] hover:bg-[var(--etab-color-hover,#064e46)] text-white gap-2">
                        <Save className="w-4 h-4" /> {saving ? 'Enregistrement...' : 'Sauvegarder'}
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
              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2" style={{ color: 'var(--etab-color, #075e54)' }}>
                    <Settings className="w-5 h-5" /> Configurer la connexion
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5"><Globe className="w-4 h-4 text-gray-400" /> URL de l&apos;API Supabase</Label>
                    <Input
                      placeholder="https://xyz.supabase.co"
                      value={syncConfig.supabaseUrl}
                      onChange={(e) => setSyncConfig({ ...syncConfig, supabaseUrl: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5"><Key className="w-4 h-4 text-gray-400" /> Clé d&apos;API Supabase (Service Role / Anon)</Label>
                    <Input
                      type="password"
                      placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                      value={syncConfig.supabaseKey}
                      onChange={(e) => setSyncConfig({ ...syncConfig, supabaseKey: e.target.value })}
                    />
                  </div>
                  <Button
                    onClick={handleSaveSyncConfig}
                    disabled={saving || syncing}
                    className="w-full bg-[var(--etab-color,#075e54)] hover:bg-[var(--etab-color-hover,#064e46)] text-white gap-2 mt-2"
                  >
                    <Save className="w-4 h-4" /> Enregistrer la configuration
                  </Button>
                </CardContent>
              </Card>

              {/* Status and Action Column */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2" style={{ color: 'var(--etab-color, #075e54)' }}>
                    <RefreshCw className="w-5 h-5" /> Actions de synchronisation
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {syncStatus ? (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Statut de la connexion :</span>
                          {syncStatus.configured ? (
                            <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Configuré</Badge>
                          ) : (
                            <Badge variant="destructive" className="gap-1"><AlertCircle className="w-3.5 h-3.5" /> Non configuré</Badge>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          Dernière synchronisation réussie : <span className="font-semibold text-gray-700 dark:text-gray-300">{syncStatus.lastSync ? new Date(syncStatus.lastSync).toLocaleString('fr-FR') : "Jamais"}</span>
                        </p>
                      </div>

                      <Button
                        onClick={handleRunSync}
                        disabled={!syncStatus.configured || syncing || saving}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 min-w-[180px]"
                      >
                        {syncing ? (
                          <><Loader2 className="w-4 h-4 animate-spin" /> Synchronisation...</>
                        ) : (
                          <><RefreshCw className="w-4 h-4" /> Lancer la synchro</>
                        )}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex justify-center p-4"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
                  )}

                  {/* Sync Summary Section */}
                  {syncSummary && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                      <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5"><Database className="w-4 h-4" /> Rapport de synchronisation</h3>
                      <div className="max-h-[220px] overflow-y-auto border border-gray-100 dark:border-gray-800 rounded-lg">
                        <Table>
                          <TableHeader className="sticky top-0 bg-white dark:bg-gray-900 z-10">
                            <TableRow className="bg-gray-50 dark:bg-gray-800">
                              <TableHead>Table</TableHead>
                              <TableHead className="text-center text-blue-600">Poussés ↑</TableHead>
                              <TableHead className="text-center text-emerald-600 font-semibold">Rapatriés ↓</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {syncSummary.stats.map((stat: any) => (
                              <TableRow key={stat.table_name} className={stat.pushed > 0 || stat.pulled > 0 ? "bg-emerald-50/10 dark:bg-emerald-900/5 font-semibold" : "opacity-60"}>
                                <TableCell className="py-2">{stat.table_name}</TableCell>
                                <TableCell className="text-center text-blue-600 py-2">{stat.pushed}</TableCell>
                                <TableCell className="text-center text-emerald-600 py-2">{stat.pulled}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </motion.div>
                  )}

                  {/* Documentation / Guide */}
                  <div className="rounded-lg bg-amber-50/50 dark:bg-amber-900/10 border border-amber-100/50 dark:border-amber-900/20 p-4 text-xs space-y-2 text-amber-800 dark:text-amber-300">
                    <h4 className="font-bold flex items-center gap-1"><AlertCircle className="w-4 h-4 text-amber-500" /> Guide rapide de configuration</h4>
                    <ol className="list-decimal list-inside space-y-1.5 ml-1">
                      <li>Créez un projet de base de données sur <strong>Supabase</strong>.</li>
                      <li>Accédez à l&apos;éditeur SQL de Supabase et exécutez le script d&apos;initialisation <strong><code className="bg-amber-100 dark:bg-amber-900/30 px-1 py-0.5 rounded">supabase_schema.sql</code></strong> fourni à la racine de ce projet.</li>
                      <li>Désactivez les politiques de sécurité (RLS) sur les tables créées ou configurez les accès adéquats.</li>
                      <li>Récupérez l&apos;URL et la clé d&apos;API dans les paramètres <strong>API Settings</strong> de votre projet Supabase et copiez-les ci-contre.</li>
                    </ol>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </motion.div>

      {/* Dialogue Nouvelle Année */}
      <Dialog open={anneeDialogOpen} onOpenChange={setAnneeDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold" style={{ color: 'var(--etab-color, #075e54)' }}>Nouvelle année scolaire</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="new-annee">Année scolaire *</Label>
              <Input id="new-annee" placeholder="Ex: 2024-2025" value={newAnnee.libelle} onChange={(e) => setNewAnnee({ ...newAnnee, libelle: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="date-debut">Date début</Label>
                <Input id="date-debut" type="date" value={newAnnee.dateDebut} onChange={(e) => setNewAnnee({ ...newAnnee, dateDebut: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="date-fin">Date fin</Label>
                <Input id="date-fin" type="date" value={newAnnee.dateFin} onChange={(e) => setNewAnnee({ ...newAnnee, dateFin: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setAnneeDialogOpen(false)}>Annuler</Button>
              <Button onClick={createAnnee} disabled={saving} className="bg-[var(--etab-color,#075e54)] hover:bg-[var(--etab-color-hover,#064e46)] text-white">
                {saving ? 'Création...' : 'Créer'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}