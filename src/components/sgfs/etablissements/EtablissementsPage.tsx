'use client'

import { useState, useEffect, useMemo } from 'react'
import { useAppStore, canManageEtablissements } from '@/lib/store'
import * as tc from '@/lib/tauri-commands'
import { Card, CardContent } from '@/components/ui/card'
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
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  },
  PRIMAIRE: {
    label: 'Primaire',
    icon: '📚',
    className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  },
  SECONDAIRE: {
    label: 'Secondaire',
    icon: '🎓',
    className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  },
  COMPLEXE: {
    label: 'Complexe',
    icon: '🏫',
    className: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  },
}

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  true: { label: 'Actif', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  false: { label: 'Inactif', className: 'bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400' },
}

const emptyForm = {
  nom: '',
  type: 'PRIMAIRE',
  adresse: '',
  telephone: '',
  email: '',
  couleurPrincipale: '#075e54',
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

  // Data & Loading states
  const [etablissements, setEtablissements] = useState<Etablissement[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // Dialog & Form states
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)

  // Filter states
  const [search, setSearch] = useState('')

  // ─── Data Fetching ─────────────────────────────────────────────────────────

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

  // ─── Filtered Data ─────────────────────────────────────────────────────────

  const filteredList = useMemo(() => {
    if (!search.trim()) return etablissements
    const q = search.toLowerCase()
    return etablissements.filter((e) => e.nom.toLowerCase().includes(q))
  }, [etablissements, search])

  // ─── Stats Calculations ────────────────────────────────────────────────────

  const totalEleves = useMemo(
    () => etablissements.reduce((sum, e) => sum + (e.nombreEleves || 0), 0),
    [etablissements]
  )

  const totalClasses = useMemo(
    () => etablissements.reduce((sum, e) => sum + (e.nombreClasses || 0), 0),
    [etablissements]
  )

  // ─── Access Control ────────────────────────────────────────────────────────

  if (user && !canManageEtablissements(user.role)) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex min-h-[60vh] flex-col items-center justify-center gap-4"
      >
        <ShieldAlert className="h-16 w-16 text-red-400" />
        <h2 className="text-2xl font-bold text-gray-700 dark:text-gray-200">
          Accès réservé
        </h2>
        <p className="text-gray-500 dark:text-gray-400">
          La gestion des établissements est réservée au coordonnateur.
        </p>
      </motion.div>
    )
  }

  // ─── CRUD Handlers ─────────────────────────────────────────────────────────

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
      couleurPrincipale: e.couleurPrincipale || '#075e54',
      devise: e.devise || 'CDF',
      rccm: e.rccm || '',
      idNat: e.idNat || '',
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.nom.trim()) {
      toast.error("Le nom de l'établissement est obligatoire")
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

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Header */}
      <motion.div
        variants={itemVariants}
        className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"
      >
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Établissements
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Gérez les écoles et centres de formation du système.
          </p>
        </div>
        <Button
          onClick={openCreate}
          className="gap-2 bg-[var(--etab-color,#075e54)] text-white hover:bg-[var(--etab-color-hover,#064e46)]"
        >
          <Plus className="h-4 w-4" />
          Nouvel établissement
        </Button>
      </motion.div>

      {/* Stats Cards */}
      <motion.div
        variants={itemVariants}
        className="grid grid-cols-1 gap-4 sm:grid-cols-3"
      >
        <Card className="border-l-4 border-l-[var(--etab-color,#075e54)]">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-full bg-[var(--etab-color,#075e54)]/10 p-3">
              <Building2 className="h-6 w-6 text-[var(--etab-color,#075e54)]" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Total établissements
              </p>
              <p className="text-xl font-bold text-gray-900 dark:text-black">
                {etablissements.length}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-[#25d366]">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-full bg-[#25d366]/10 p-3">
              <Users className="h-6 w-6 text-[#25d366]" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Total élèves
              </p>
              <p className="text-xl font-bold text-gray-900 dark:text-black">
                {totalEleves}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-full bg-amber-500/10 p-3">
              <LayoutGrid className="h-6 w-6 text-amber-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Total classes
              </p>
              <p className="text-xl font-bold text-gray-900 dark:text-black">
                {totalClasses}
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Search Filter */}
      <motion.div variants={itemVariants} className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Rechercher un établissement..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </motion.div>

      {/* Table */}
      <motion.div variants={itemVariants}>
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-4 p-6">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="flex gap-4">
                    <Skeleton className="h-8 w-1/4" />
                    <Skeleton className="h-8 w-1/6" />
                    <Skeleton className="h-8 w-1/5" />
                    <Skeleton className="h-8 w-1/6" />
                  </div>
                ))}
              </div>
            ) : filteredList.length === 0 ? (
              <div className="p-12 text-center text-gray-500 dark:text-gray-400">
                <School className="mx-auto mb-3 h-12 w-12 opacity-30" />
                <p className="text-lg font-medium">Aucun établissement trouvé</p>
                <p className="mt-1 text-sm">
                  {search.trim()
                    ? 'Essayez un autre terme de recherche.'
                    : "Commencez par créer votre premier établissement."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50  bg-[var(--etab-color,#075e54)] text-white">
                      <TableHead>Nom</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Téléphone</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead className="text-center">Élèves</TableHead>
                      <TableHead className="text-center">Classes</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredList.map((e) => {
                      const typeInfo =
                        TYPE_MAP[e.type] || {
                          label: e.type,
                          className: 'bg-[#044314] text-[#a7b305]',
                        }
                      const statusInfo =
                        STATUS_MAP[String(e.actif)] || {
                          label: e.actif ? 'Actif' : 'Inactif',
                          className: 'bg-[#044314] text-[#a7b305]',
                        }
                      return (
                        <TableRow
                          key={e.id}
                          className="hover:bg-[#044314] dark:hover:bg-gray-800/30"
                        >
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div
                                className="h-3 w-3 rounded-full flex-shrink-0"
                                style={{
                                  backgroundColor: e.couleurPrincipale || '#075e54',
                                }}
                              />
                              <span className="font-medium">{e.nom}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="bg-[#044314] text-[#a7b305]">
                              {(typeInfo as any).icon || ''} {typeInfo.label}
                            </Badge>
                          </TableCell>
                          <TableCell>{e.telephone || '—'}</TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {e.email || '—'}
                          </TableCell>
                          <TableCell className="text-center font-medium">
                            {e.nombreEleves || 0}
                          </TableCell>
                          <TableCell className="text-center font-medium">
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
                                className="text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                                onClick={() => openEdit(e)}
                                title="Modifier"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className={
                                  e.actif
                                    ? 'text-amber-500 hover:text-amber-700 hover:bg-[#044314]'
                                    : 'text-green-500 hover:text-green-700 hover:bg-[#044314]'
                                }
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
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto bg-white/90">
          <DialogHeader>
            <DialogTitle
              className="text-lg font-semibold"
              style={{ color: 'var(--etab-color, #075e54)' }}
            >
              {editingId
                ? "Modifier l'établissement"
                : 'Nouvel établissement'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Nom */}
            <div className="space-y-2">
              <Label htmlFor="etab-nom">Nom *</Label>
              <Input
                id="etab-nom"
                placeholder="Ex: Complexe Scolaire La Réussite"
                value={form.nom}
                onChange={(e) => setForm({ ...form, nom: e.target.value })}
              />
            </div>

            {/* Type + Devise */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="etab-type">Type</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => setForm({ ...form, type: v })}
                >
                  <SelectTrigger id="etab-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white/90">
                    <SelectItem value="MATERNELLE">🧒 Maternelle</SelectItem>
                    <SelectItem value="PRIMAIRE">📚 Primaire</SelectItem>
                    <SelectItem value="SECONDAIRE">🎓 Secondaire</SelectItem>
                    <SelectItem value="COMPLEXE">🏫 Complexe</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="etab-devise">Devise par défaut</Label>
                <Select
                  value={form.devise}
                  onValueChange={(v) => setForm({ ...form, devise: v })}
                >
                  <SelectTrigger id="etab-devise">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CDF">CDF (Franc congolais)</SelectItem>
                    <SelectItem value="USD">USD ($)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Adresse */}
            <div className="space-y-2">
              <Label htmlFor="etab-adresse">Adresse</Label>
              <Input
                id="etab-adresse"
                placeholder="Ex: 123, Av. de la Paix, Gombe"
                value={form.adresse}
                onChange={(e) => setForm({ ...form, adresse: e.target.value })}
              />
            </div>

            {/* Téléphone + Email */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="etab-tel">Téléphone</Label>
                <Input
                  id="etab-tel"
                  placeholder="Ex: +243 812 345 678"
                  value={form.telephone}
                  onChange={(e) =>
                    setForm({ ...form, telephone: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="etab-email">Email</Label>
                <Input
                  id="etab-email"
                  type="email"
                  placeholder="Ex: contact@ecole.cd"
                  value={form.email}
                  onChange={(e) =>
                    setForm({ ...form, email: e.target.value })
                  }
                />
              </div>
            </div>

            {/* Couleur principale */}
            <div className="space-y-2">
              <Label htmlFor="etab-couleur">Couleur principale</Label>
              <div className="flex items-center gap-3">
                <input
                  id="etab-couleur"
                  type="color"
                  value={form.couleurPrincipale}
                  onChange={(e) =>
                    setForm({ ...form, couleurPrincipale: e.target.value })
                  }
                  className="h-10 w-14 cursor-pointer rounded-md border border-gray-200 bg-transparent"
                />
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {form.couleurPrincipale}
                </span>
              </div>
            </div>

            {/* RCCM + ID Nat */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="etab-rccm">RCCM</Label>
                <Input
                  id="etab-rccm"
                  placeholder="N° RCCM"
                  value={form.rccm}
                  onChange={(e) =>
                    setForm({ ...form, rccm: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="etab-idnat">ID National</Label>
                <Input
                  id="etab-idnat"
                  placeholder="N° Id. National"
                  value={form.idNat}
                  onChange={(e) =>
                    setForm({ ...form, idNat: e.target.value })
                  }
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Annuler
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving}
                className="bg-[var(--etab-color,#075e54)] text-white hover:bg-[var(--etab-color-hover,#064e46)]"
              >
                {saving
                  ? 'Enregistrement...'
                  : editingId
                    ? 'Mettre à jour'
                    : 'Créer'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}