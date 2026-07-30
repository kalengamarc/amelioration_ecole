import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ── Currency Formatting (Burundi-centric) ─────────────────────────────────

const WHOLE_CURRENCIES = ['BIF', 'CDF']

/**
 * Format a monetary amount for display.
 * - BIF  → "50 000 FBu"  (no decimals, French-style thousands separator)
 * - CDF  → "50 000 CDF"  (no decimals)
 * - USD  → "$1,234.56"   (2 decimals, en-US style)
 * - other → fallback to Intl with 2 decimals
 */
export function formatMoney(amount: number | string | null | undefined, devise: string = 'CDF'): string {
  const value = Number(amount || 0)

  if (devise === 'BIF') {
    return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FBu`
  }

  if (devise === 'CDF') {
    return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} CDF`
  }

  // USD or other — 2 decimals
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: devise === 'USD' ? 'USD' : devise,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

/** Check if a currency uses whole numbers (no decimals) */
export function isWholeCurrency(devise: string): boolean {
  return WHOLE_CURRENCIES.includes(devise)
}
