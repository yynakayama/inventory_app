// 生産計画データの型定義
export interface ProductionPlan {
  id: number
  building_no: string | null
  product_code: string
  product_name: string
  planned_quantity: number
  start_date: string
  status: '計画' | '生産中' | '完了'
  remarks: string | null
  created_by: string
  created_at: string
  updated_at: string
  has_shortage: boolean // ★ リファクタリングで追加
}

// 製品マスタの型定義
export interface Product {
  product_code: string
  product_name: string
  category: string | null
}

// 所要量計算結果の型定義
export interface RequirementCalculation {
  plan_id: number
  product_code: string
  planned_quantity: number
  requirements: RequirementItem[]
  shortage_summary: {
    has_shortage: boolean
    shortage_parts_count: number
    shortage_parts: ShortageItem[]
  }
}

export interface RequirementItem {
  part_code: string
  required_quantity: number
  current_stock: number
  total_reserved_stock: number
  plan_reserved_quantity: number
  scheduled_receipts_until_start: number
  available_stock: number
  shortage_quantity: number
  is_sufficient: boolean
  procurement_due_date: string
  supplier: string
  lead_time_days: number
  used_in_stations: any[]
}

export interface ShortageItem {
  part_code: string
  shortage_quantity: number
  required_quantity: number
  available_stock: number
  stations: any[]
  procurement_due_date: string
  supplier: string
  lead_time_days: number
}

// 検索フィルタの型定義
export interface SearchFilters {
  product_code: string
  status: string
  building_no: string
  date_from: string
  date_to: string
}

// 新規計画フォームの型定義
export interface PlanForm {
  building_no: string
  product_code: string
  planned_quantity: string
  start_date: string
  remarks: string
}

// ステータス表示コンポーネントのProps
export interface StatusBadgeProps {
  status: string
}