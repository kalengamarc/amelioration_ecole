'use client'

import { useAppStore, DEFAULT_COLOR, type PageName, getRoleLabel } from '@/lib/store'
import {
  LayoutDashboard,
  Building2,
  GraduationCap,
  Users,
  Receipt,
  Banknote,
  CalendarClock,
  TrendingDown,
  FileText,
  Shield,
  Settings,
  UserCog,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import type { LucideIcon } from 'lucide-react'

import logoSrc from '@/assets/logo.png'

export type { PageName }

interface Etablissement {
  id: string
  nom: string
  type: string
}

interface SidebarProps {
  etablissements: Etablissement[]
}

interface MenuItem {
  key: PageName
  label: string
  icon: LucideIcon
  roles: 'all' | string[]
}

const menuItems: MenuItem[] = [
  { key: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard, roles: 'all' },
  { key: 'etablissements', label: 'Établissements', icon: Building2, roles: ['COORDINATEUR'] },
  { key: 'classes', label: 'Classes', icon: GraduationCap, roles: ['COORDINATEUR'] },
  { key: 'eleves', label: 'Élèves', icon: Users, roles: 'all' },
  { key: 'frais', label: 'Frais scolaires', icon: Banknote, roles: ['COORDINATEUR'] },
  { key: 'echeances', label: 'Échéances', icon: CalendarClock, roles: 'all' },
  { key: 'encaissements', label: 'Encaissements', icon: Receipt, roles: 'all' },
  { key: 'depenses', label: 'Dépenses', icon: TrendingDown, roles: 'all' },
  { key: 'rapports', label: 'Rapports', icon: FileText, roles: 'all' },
  { key: 'audit', label: "Journal d'audit", icon: Shield, roles: ['COORDINATEUR'] },
  { key: 'parametres', label: 'Paramètres', icon: Settings, roles: ['COORDINATEUR'] },
  { key: 'utilisateurs', label: 'Utilisateurs', icon: UserCog, roles: ['COORDINATEUR'] },
]

function getUserInitials(nomComplet: string | undefined | null): string {
  if (!nomComplet) return '??'
  return nomComplet
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export default function Sidebar({ etablissements }: SidebarProps) {
  const { currentPage, setPage, user, logout, sidebarOpen, toggleSidebar, currentEtablissement } = useAppStore()

  const accentColor = currentEtablissement?.couleurPrincipale || DEFAULT_COLOR
  const schoolName = currentEtablissement?.nom || 'SGFS-ME'

  const role = user?.role ?? ''
  const filteredItems = menuItems.filter(
    (item) => item.roles === 'all' || item.roles.includes(role)
  )

  const navItem = (item: MenuItem) => {
    const isActive = currentPage === item.key
    const Icon = item.icon

    const buttonContent = (
      <Button
        variant="ghost"
        onClick={() => setPage(item.key)}
        className={`
          relative w-full flex items-center gap-2.5 px-2.5 h-8 rounded-md
          text-[13px] font-medium transition-all duration-150
          ${sidebarOpen ? 'justify-start' : 'justify-center'}
          ${isActive
            ? 'text-white bg-white/[0.08]'
            : 'text-[#a7b305] hover:bg-white/[0.04] hover:text-zinc-200'
          }
        `}
         style={isActive
          ? { borderLeft: `2px solid ${accentColor}`, paddingLeft: '8px' }
          : { borderLeft: '2px solid transparent', paddingLeft: '8px' }
        }
      >
        <Icon className="h-4 w-4 shrink-0" strokeWidth={isActive ? 2.2 : 1.5} />
        <AnimatePresence>
          {sidebarOpen && (
            <motion.span
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.15, ease: "easeInOut" }}
              className="whitespace-nowrap overflow-hidden"
            >
              {item.label}
            </motion.span>
          )}
        </AnimatePresence>
      </Button>
    )

    if (!sidebarOpen) {
      return (
        <Tooltip key={item.key} delayDuration={0}>
          <TooltipTrigger asChild>{buttonContent}</TooltipTrigger>
          <TooltipContent side="right" sideOffset={10} className="border-zinc-800 bg-zinc-900 text-zinc-200">
            <p className="text-xs font-medium">{item.label}</p>
          </TooltipContent>
        </Tooltip>
      )
    }

    return <div key={item.key}>{buttonContent}</div>
  }

  return (
    <>
      {/* Mobile backdrop */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
            onClick={toggleSidebar}
          />
        )}
      </AnimatePresence>

      {/* Sidebar Container */}
      <motion.aside
        initial={false}
        animate={{ width: sidebarOpen ? 240 : 60 }}
        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        className={`
          fixed top-0 left-0 z-50 h-screen flex flex-col
           bg-[var(--etab-color,#075e54)] border-r border-white/[0.06]
          ${sidebarOpen ? 'max-md:translate-x-0' : 'max-md:-translate-x-full'}
          md:translate-x-0 transition-transform duration-200
          overflow-hidden
        `}
      >
        <TooltipProvider>
          {/* Top accent bar */}
          <div className="h-[2px] shrink-0 w-full" style={{ backgroundColor: accentColor }} />
          
          {/* Logo Section - Compact */}
          <div className="flex flex-col items-center gap-2.5 px-3 h-22 mt-4 shrink-0">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md" style={{ backgroundColor: `${accentColor}25` }}>
              <Image
                src={logoSrc}
                alt="Logo"
                fill
                sizes="28px"
                className="object-contain p-0.5"
                priority
              />
            </div>
            <AnimatePresence>
              {sidebarOpen && (
                <motion.div
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.15 }}
                  className="overflow-hidden whitespace-wrap flex-1 min-w-0" /* <-- CORRIGÉ ICI */
                >
                  <span className="text-sm font-bold tracking-tight text-[#a7b305] text-justify"> {/* <-- CORRIGÉ ICI */}
                    {schoolName}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* User Section - Compact */}
          <div className="flex items-center gap-2.5 px-3 py-1.5 shrink-0">
            <div className="flex items-center justify-center h-7 w-7 rounded-full shrink-0 text-[10px] font-bold text-white" style={{ backgroundColor: `${accentColor}CC` }}>
              {user ? getUserInitials(user.nomComplet) : '??'}
            </div>
            <AnimatePresence>
              {sidebarOpen && user && (
                <motion.div
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.15 }}
                  className="overflow-hidden whitespace-nowrap flex-1 min-w-0" /* <-- CORRIGÉ ICI */
                >
                  <p className="text-xs font-semibold text-zinc-200 leading-tight truncate"> {/* <-- CORRIGÉ ICI */}
                    {user.nomComplet}
                  </p>
                  <p className="text-[10px] text-zinc-500 leading-tight">
                    {getRoleLabel(user.role)}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="px-3">
            <Separator className="bg-white/[0.06]" />
          </div>

          {/* Navigation - Scrollable & Compact */}
          <ScrollArea className="flex-1 px-1.5 py-1.5">
            <nav className="flex flex-col gap-0.5">
              {filteredItems.map(navItem)}
            </nav>
          </ScrollArea>

          {/* Bottom Actions - Compact */}
          <div className="px-1.5 pb-2 flex flex-col gap-0.5 shrink-0">
            <Separator className="bg-white/[0.06] mb-1" />

            <div className="flex gap-0.5">
              {sidebarOpen ? (
                <Button
                  variant="ghost"
                  onClick={toggleSidebar}
                  className="flex-1 flex items-center gap-2 px-2.5 h-8 rounded-md text-xs text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300 justify-start"
                >
                  <ChevronLeft className="h-4 w-4 shrink-0" />
                  <span>Réduire</span>
                </Button>
              ) : (
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      onClick={toggleSidebar}
                      className="w-full flex items-center justify-center h-8 rounded-md text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
                    >
                      <ChevronRight className="h-4 w-4 shrink-0" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={10} className="border-zinc-800 bg-zinc-900 text-zinc-200">
                    <p className="text-xs font-medium">Développer</p>
                  </TooltipContent>
                </Tooltip>
              )}

              {sidebarOpen ? (
                <Button
                  variant="ghost"
                  onClick={logout}
                  className="flex-1 flex items-center gap-2 px-2.5 h-8 rounded-md text-xs text-red-400/80 hover:bg-red-500/10 hover:text-red-300 justify-start"
                >
                  <LogOut className="h-4 w-4 shrink-0" />
                  <span>Quitter</span>
                </Button>
              ) : (
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      onClick={logout}
                      className="w-full flex items-center justify-center h-8 rounded-md text-red-400/80 hover:bg-red-500/10 hover:text-red-300"
                    >
                      <LogOut className="h-4 w-4 shrink-0" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={10} className="border-zinc-800 bg-zinc-900 text-zinc-200">
                    <p className="text-xs font-medium">Déconnexion</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        </TooltipProvider>
      </motion.aside>
    </>
  )
}