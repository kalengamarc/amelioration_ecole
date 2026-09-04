'use client'

import { useState, useEffect, useMemo } from 'react'
import { useAppStore, canManageEtablissements } from '@/lib/store'
import * as tc from '@/lib/tauri-commands'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import {
  Plus,
  Search,
  Edit,
  School,
  Users,
  LayoutGrid,
  ShieldAlert,
  Building2,
  ToggleLeft,
  ToggleRight,
  Sparkles
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Etablissement {
  id: string
  nom: string
  type: string
  adresse?: string | null
  telephone?: string | null
  email?: string | null
  couleurPrincipale?: string | null
  devise?: string | null
  rccm?: string | null
  idNat?: string | null
  actif: boolean
  createdAt?: string
  nombreEleves: number
  nombreClasses: number
  nombreFrais: number
}

// ─── Constants & Helpers ─────────────────────────────────────────────────────

const TYPE_MAP: Record<string, { label: string; className: string; icon: string }> = {
  MATERNELLE: {
    label: 'Maternelle',
    icon: '🧒',
    className: 'bg-amber-100 text-amber-900 border border-amber-200 font-semibold',
  },
  PRIMAIRE: {
    label: 'Primaire',
    icon: '📚',
    className: 'bg-emerald-100 text-emerald-900 border border-emerald-200 font-semibold',
  },
  SECONDAIRE: {
    label: 'Secondaire',
    icon: '🎓',
    className: 'bg-sky-100 text-sky-900 border border-sky-200 font-semibold',
  },
  HUMANITE: {
    label: 'Humanités',
    icon: '🏛️',
    className: 'bg-violet-100 text-violet-900 border border-violet-200 font-semibold',
  },
  COMPLEXE: {
    label: 'Complexe',
    icon: '🏫',
    className: 'bg-purple-100 text-purple-900 border border-purple-200 font-semibold',
  },
}

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  true: { label: 'Actif', className: 'bg-emerald-100 text-emerald-800 border border-emerald-200 font-semibold' },
  false: { label: 'Inactif', className: 'bg-rose-100 text-rose-800 border border-rose-200 font-semibold' },
}

const emptyForm = {
  nom: '',
  type: 'PRIMAIRE',
  adresse: '',
  telephone: '',
  email: '',
  couleurPrincipale: '#0c241f',
  devise: 'CDF',
  rccm: '',
  idNat: '',
}

// ─── Animation Variants ──────────────────────────────────────────────────────

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.07 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function EtablissementsPage() {
  const { user } = useAppStore()

  const [etablissements, setEtablissements] = useState<Etablissement[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)

  const [search, setSearch] = useState('')

  async function fetchEtablissements() {
    setLoading(true)
    try {
      const response = await tc.listEtablissements()
      const data = response?.etablissements ?? []
      setEtablissements(Array.isArray(data) ? data : [])
    } catch (err: any) {
      toast.error(err?.message || err?.error || 'Erreur lors du chargement des établissements')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!user) return
    fetchEtablissements()
  }, [user])

  const filteredList = useMemo(() => {
    if (!search.trim()) return etablissements
    const q = search.toLowerCase()
    return etablissements.filter((e) => e.nom.toLowerCase().includes(q))
  }, [etablissements, search])

  const totalEleves = useMemo(
    () => etablissements.reduce((sum, e) => sum + (e.nombreEleves || 0), 0),
    [etablissements]
  )

  const totalClasses = useMemo(
    () => etablissements.reduce((sum, e) => sum + (e.nombreClasses || 0), 0),
    [etablissements]
  )

  if (user && !canManageEtablissements(user.role)) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex min-h-[60vh] flex-col items-center justify-center gap-4"
      >
        <ShieldAlert className="h-16 w-16 text-rose-500" />
        <h2 className="text-2xl font-bold text-stone-800">
          Accès réservé
        </h2>
        <p className="text-stone-500">
          La gestion des établissements est réservée au coordonnateur ou à l'administrateur.
        </p>
      </motion.div>
    )
  }

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  function openEdit(e: Etablissement) {
    setEditingId(e.id)
    setForm({
      nom: e.nom,
      type: e.type || 'PRIMAIRE',
      adresse: e.adresse || '',
      telephone: e.telephone || '',
      email: e.email || '',
      couleurPrincipale: e.couleurPrincipale || '#0c241f',
      devise: e.devise || 'CDF',
      rccm: e.rccm || '',
      idNat: e.idNat || '',
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.nom.trim()) {
      toast.error("Le nom de l'établissement est obligatoire (*)")
      return
    }

    setSaving(true)
    try {
      const payload: Record<string, any> = {
        nom: form.nom.trim(),
        type: form.type,
      }
      if (form.adresse.trim()) payload.adresse = form.adresse.trim()
      if (form.telephone.trim()) payload.telephone = form.telephone.trim()
      if (form.email.trim()) payload.email = form.email.trim()
      if (form.couleurPrincipale) payload.couleurPrincipale = form.couleurPrincipale
      if (form.devise) payload.devise = form.devise
      if (form.rccm.trim()) payload.rccm = form.rccm.trim()
      if (form.idNat.trim()) payload.idNat = form.idNat.trim()

      if (editingId) {
        await tc.updateEtablissement(editingId, payload)
        toast.success('Établissement mis à jour avec succès')
      } else {
        await tc.createEtablissement(payload)
        toast.success('Établissement créé avec succès')
      }

      setDialogOpen(false)
      fetchEtablissements()
    } catch (err: any) {
      toast.error(err?.message || err?.error || "Erreur lors de l'enregistrement")
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActif(e: Etablissement) {
    const newActif = !e.actif
    const action = newActif ? 'activer' : 'désactiver'
    if (!confirm(`Voulez-vous ${action} l'établissement « ${e.nom} » ?`)) return

    setTogglingId(e.id)
    try {
      await tc.updateEtablissement(e.id, { actif: newActif })
      toast.success(`Établissement ${newActif ? 'activé' : 'désactivé'} avec succès`)
      fetchEtablissements()
    } catch (err: any) {
      toast.error(err?.message || err?.error || `Erreur lors de la ${action}ion`)
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6 p-2 sm:p-4 md:p-6"
    >
      {/* Banner Header */}
      <motion.div
        variants={itemVariants}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-stone-200/80 shadow-sm"
      >
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-700 text-xs font-bold border border-amber-500/20 mb-2">
            <Building2 className="h-3.5 w-3.5" /> Établissements Scolaires
          </div>
          <h1 className="text-2xl font-extrabold text-stone-900 tracking-tight">
            Répertoire des Établissements
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">
            Gérez les écoles, types d&apos;enseignement et paramètres de chaque site.
          </p>
        </div>
        <Button
          onClick={openCreate}
          className="bg-[#0c241f] hover:bg-[#071916] text-white font-bold px-5 py-2.5 rounded-xl shadow-md gap-2"
        >
          <Plus className="h-4 w-4 text-amber-400" />
          Nouvel établissement
        </Button>
      </motion.div>

      {/* Stats Cards */}
      <motion.div
        variants={itemVariants}
        className="grid grid-cols-1 gap-4 sm:grid-cols-3"
      >
        <Card className="rounded-2xl border-stone-200/80 bg-white shadow-sm border-l-4 border-l-[#0c241f]">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-2xl bg-[#0c241f]/10 p-3.5 border border-[#0c241f]/20">
              <Building2 className="h-6 w-6 text-[#0c241f]" />
            </div>
            <div>
              <p className="text-xs font-semibold text-stone-500">
                Total Établissements
              </p>
              <p className="text-2xl font-extrabold text-stone-900">
                {etablissements.length}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-stone-200/80 bg-white shadow-sm border-l-4 border-l-emerald-600">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-2xl bg-emerald-500/10 p-3.5 border border-emerald-500/20">
              <Users className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs font-semibold text-stone-500">
                Total Élèves Inscrits
              </p>
              <p className="text-2xl font-extrabold text-stone-900">
                {totalEleves}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-stone-200/80 bg-white shadow-sm border-l-4 border-l-amber-500">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-2xl bg-amber-500/10 p-3.5 border border-amber-500/20">
              <LayoutGrid className="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <p className="text-xs font-semibold text-stone-500">
                Total Classes
              </p>
              <p className="text-2xl font-extrabold text-stone-900">
                {totalClasses}
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Search Filter */}
      <motion.div variants={itemVariants} className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <Input
            placeholder="Rechercher un établissement par nom..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 rounded-xl border-stone-200 font-medium"
          />
        </div>
      </motion.div>

      {/* Table */}
      <motion.div variants={itemVariants}>
        <Card className="rounded-2xl border-stone-200/80 shadow-sm overflow-hidden">
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-4 p-8">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-10 w-full rounded-xl" />
                ))}
              </div>
            ) : filteredList.length === 0 ? (
              <div className="p-12 text-center text-stone-400">
                <School className="mx-auto mb-3 h-12 w-12 opacity-30" />
                <p className="text-base font-bold text-stone-700">Aucun établissement trouvé</p>
                <p className="mt-1 text-xs">
                  {search.trim()
                    ? 'Essayez un autre terme de recherche.'
                    : "Commencez par créer votre premier établissement."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-[#0c241f] text-white">
                    <TableRow className="hover:bg-[#0c241f]">
                      <TableHead className="text-amber-300 font-bold">Nom de l&apos;Établissement</TableHead>
                      <TableHead className="text-white font-bold">Type</TableHead>
                      <TableHead className="text-white font-bold">Téléphone</TableHead>
                      <TableHead className="text-white font-bold">Email</TableHead>
                      <TableHead className="text-center text-white font-bold">Élèves</TableHead>
                      <TableHead className="text-center text-white font-bold">Classes</TableHead>
                      <TableHead className="text-white font-bold">Statut</TableHead>
                      <TableHead className="text-right text-white font-bold">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredList.map((e) => {
                      const typeInfo =
                        TYPE_MAP[e.type] || {
                          label: e.type,
                          className: 'bg-stone-100 text-stone-800',
                        }
                      const statusInfo =
                        STATUS_MAP[String(e.actif)] || {
                          label: e.actif ? 'Actif' : 'Inactif',
                          className: 'bg-stone-100 text-stone-800',
                        }
                      return (
                        <TableRow
                          key={e.id}
                          className="hover:bg-amber-500/5 transition-colors"
                        >
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <div
                                className="h-3.5 w-3.5 rounded-full flex-shrink-0 shadow-sm border border-black/10"
                                style={{
                                  backgroundColor: e.couleurPrincipale || '#0c241f',
                                }}
                              />
                              <span className="font-bold text-stone-900 break-words">{e.nom}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={typeInfo.className}>
                              {(typeInfo as any).icon || ''} {typeInfo.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium text-stone-700">{e.telephone || '—'}</TableCell>
                          <TableCell className="font-medium text-stone-700 break-words">
                            {e.email || '—'}
                          </TableCell>
                          <TableCell className="text-center font-bold text-stone-900">
                            {e.nombreEleves || 0}
                          </TableCell>
                          <TableCell className="text-center font-bold text-stone-900">
                            {e.nombreClasses || 0}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={statusInfo.className}>
                              {statusInfo.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-amber-700 hover:bg-amber-50"
                                onClick={() => openEdit(e)}
                                title="Modifier"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className={`h-8 w-8 ${
                                  e.actif
                                    ? 'text-amber-600 hover:bg-amber-50'
                                    : 'text-emerald-600 hover:bg-emerald-50'
                                }`}
                                onClick={() => handleToggleActif(e)}
                                disabled={togglingId === e.id}
                                title={e.actif ? 'Désactiver' : 'Activer'}
                              >
                                {e.actif ? (
                                  <ToggleRight className="h-4 w-4" />
                                ) : (
                                  <ToggleLeft className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ─── Dialog: Create / Edit ───────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto bg-white p-6 sm:p-8 rounded-3xl border border-stone-200 shadow-2xl">
          <DialogHeader className="border-b border-stone-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-[#0c241f] text-amber-400">
                <Building2 className="h-6 w-6" />
              </div>
              <div>
                <DialogTitle className="text-xl font-extrabold text-[#0c241f]">
                  {editingId ? "Modifier l'établissement" : 'Nouvel établissement'}
                </DialogTitle>
                <p className="text-xs text-stone-500 font-medium">Saisissez les coordonnées et caractéristiques du site.</p>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 pt-4">
            <div>
              <Label htmlFor="etab-nom" className="text-xs font-semibold text-stone-600">Nom de l&apos;établissement *</Label>
              <Input
                id="etab-nom"
                placeholder="Ex: Complexe Scolaire Le Bon Berger"
                value={form.nom}
                onChange={(e) => setForm({ ...form, nom: e.target.value })}
                className="rounded-xl border-stone-200 bg-white font-medium mt-1"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="etab-type" className="text-xs font-semibold text-stone-600">Type d&apos;enseignement</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => setForm({ ...form, type: v })}
                >
                  <SelectTrigger id="etab-type" className="rounded-xl border-stone-200 bg-white font-medium mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="MATERNELLE">🧒 Maternelle</SelectItem>
                    <SelectItem value="PRIMAIRE">📚 Primaire</SelectItem>
                    <SelectItem value="SECONDAIRE">🎓 Secondaire</SelectItem>
                    <SelectItem value="HUMANITE">🏛️ Humanités</SelectItem>
                    <SelectItem value="COMPLEXE">🏫 Complexe</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="etab-devise" className="text-xs font-semibold text-stone-600">Devise par défaut</Label>
                <Select
                  value={form.devise}
                  onValueChange={(v) => setForm({ ...form, devise: v })}
                >
                  <SelectTrigger id="etab-devise" className="rounded-xl border-stone-200 bg-white font-medium mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="CDF">CDF (Franc congolais)</SelectItem>
                    <SelectItem value="USD">USD ($)</SelectItem>
                    <SelectItem value="BIF">BIF (Franc burundais)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="etab-adresse" className="text-xs font-semibold text-stone-600">Adresse physique</Label>
              <Input
                id="etab-adresse"
                placeholder="Ex: N° 12, Avenue de la Paix, Q/ Buhero"
                value={form.adresse}
                onChange={(e) => setForm({ ...form, adresse: e.target.value })}
                className="rounded-xl border-stone-200 bg-white font-medium mt-1"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="etab-tel" className="text-xs font-semibold text-stone-600">Téléphone de contact</Label>
                <Input
                  id="etab-tel"
                  placeholder="Ex: +243 812 345 678"
                  value={form.telephone}
                  onChange={(e) =>
                    setForm({ ...form, telephone: e.target.value })
                  }
                  className="rounded-xl border-stone-200 bg-white font-medium mt-1"
                />
              </div>
              <div>
                <Label htmlFor="etab-email" className="text-xs font-semibold text-stone-600">Email professionnel</Label>
                <Input
                  id="etab-email"
                  type="email"
                  placeholder="Ex: contact@ecole.cd"
                  value={form.email}
                  onChange={(e) =>
                    setForm({ ...form, email: e.target.value })
                  }
                  className="rounded-xl border-stone-200 bg-white font-medium mt-1"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="etab-couleur" className="text-xs font-semibold text-stone-600">Couleur thématique principale</Label>
              <div className="flex items-center gap-3 mt-1">
                <input
                  id="etab-couleur"
                  type="color"
                  value={form.couleurPrincipale}
                  onChange={(e) =>
                    setForm({ ...form, couleurPrincipale: e.target.value })
                  }
                  className="h-10 w-16 cursor-pointer rounded-xl border border-stone-200 bg-transparent p-1"
                />
                <span className="text-xs font-mono font-bold text-stone-700 bg-stone-100 px-3 py-1.5 rounded-lg border border-stone-200">
                  {form.couleurPrincipale}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="etab-rccm" className="text-xs font-semibold text-stone-600">Numéro RCCM</Label>
                <Input
                  id="etab-rccm"
                  placeholder="N° RCCM"
                  value={form.rccm}
                  onChange={(e) =>
                    setForm({ ...form, rccm: e.target.value })
                  }
                  className="rounded-xl border-stone-200 bg-white font-medium mt-1"
                />
              </div>
              <div>
                <Label htmlFor="etab-idnat" className="text-xs font-semibold text-stone-600">Identifiant National</Label>
                <Input
                  id="etab-idnat"
                  placeholder="N° Id. National"
                  value={form.idNat}
                  onChange={(e) =>
                    setForm({ ...form, idNat: e.target.value })
                  }
                  className="rounded-xl border-stone-200 bg-white font-medium mt-1"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-stone-100 pt-4">
              <Button
                variant="outline"
                className="rounded-xl border-stone-200"
                onClick={() => setDialogOpen(false)}
              >
                Annuler
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving}
                className="bg-[#0c241f] hover:bg-[#071916] text-white font-bold rounded-xl px-6 shadow-md"
              >
                {saving
                  ? 'Enregistrement...'
                  : editingId
                    ? 'Mettre à jour'
                    : 'Créer l’établissement'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}