// 予定入荷データの型定義
export interface ScheduledReceipt {
  id: number
  order_no: string
  part_code: string
  specification: string
  supplier: string
  order_quantity: number
  scheduled_quantity: number | null
  order_date: string
  requested_date: string | null
  scheduled_date: string | null
  status: '納期回答待ち' | '入荷予定' | '入荷済み' | 'キャンセル'
  remarks: string | null
  current_stock: number
  reserved_stock: number
}

// 入荷処理フォームの型定義
export interface ReceiptForm {
  actualQuantity: string
  receiptDate: string
  remarks: string
}

// 納期回答フォームの型定義
export interface DeliveryForm {
  scheduledQuantity: string
  scheduledDate: string
  remarks: string
}

// 新規発注フォームの型定義
export interface OrderForm {
  partCode: string
  orderQuantity: string
  scheduledDate: string
  remarks: string
}

// 検索フィルタの型定義
export interface ProcurementFilters {
  status: string
  partCode: string
}

// ステータス表示コンポーネントのProps
export interface StatusBadgeProps {
  status: string
}