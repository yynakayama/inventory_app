import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * CSS クラスを効率的に結合するユーティリティ関数
 * Tailwind CSS のクラス名競合を自動解決
 * 
 * @param inputs - CSS クラス名（文字列、配列、オブジェクト、undefined等）
 * @returns 結合・最適化されたクラス名文字列
 * 
 * 使用例:
 * cn('px-2 py-1', 'px-4') // → 'py-1 px-4' (px-2は上書きされる)
 * cn('bg-red-500', condition && 'bg-blue-500') // → 条件により動的切り替え
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/**
 * 日付を日本語形式でフォーマット
 * 
 * @param date - Date オブジェクトまたは日付文字列
 * @param format - フォーマット形式 ('short' | 'long' | 'datetime')
 * @returns フォーマットされた日付文字列
 */
export function formatDate(
  date: Date | string, 
  format: 'short' | 'long' | 'datetime' = 'short'
): string {
  const d = new Date(date)
  
  if (isNaN(d.getTime())) {
    return '無効な日付'
  }
  
  const formatOptions: Record<string, Intl.DateTimeFormatOptions> = {
    short: { year: 'numeric', month: '2-digit', day: '2-digit' },
    long: { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' },
    datetime: { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit' 
    }
  }
  
  return d.toLocaleDateString('ja-JP', formatOptions[format])
}

/**
 * 数値を3桁区切りでフォーマット
 * 
 * @param value - 数値
 * @param options - フォーマットオプション
 * @returns フォーマットされた数値文字列
 */
export function formatNumber(
  value: number, 
  options: {
    minimumFractionDigits?: number
    maximumFractionDigits?: number
    currency?: string
  } = {}
): string {
  const { minimumFractionDigits = 0, maximumFractionDigits = 0, currency } = options
  
  if (currency) {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency,
      minimumFractionDigits,
      maximumFractionDigits
    }).format(value)
  }
  
  return new Intl.NumberFormat('ja-JP', {
    minimumFractionDigits,
    maximumFractionDigits
  }).format(value)
}

/**
 * 文字列を指定された長さで切り詰め
 * 
 * @param str - 対象文字列
 * @param length - 最大長
 * @param suffix - 切り詰め時に追加する文字（デフォルト: '...'）
 * @returns 切り詰められた文字列
 */
export function truncate(str: string, length: number, suffix: string = '...'): string {
  if (str.length <= length) return str
  return str.slice(0, length - suffix.length) + suffix
}

/**
 * 深いオブジェクトのコピーを作成
 * 
 * @param obj - コピー対象のオブジェクト
 * @returns 深いコピーされたオブジェクト
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj
  if (obj instanceof Date) return new Date(obj.getTime()) as T
  if (obj instanceof Array) return obj.map(item => deepClone(item)) as T
  if (typeof obj === 'object') {
    const copy = {} as T
    Object.keys(obj).forEach(key => {
      (copy as any)[key] = deepClone((obj as any)[key])
    })
    return copy
  }
  return obj
}