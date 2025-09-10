// テーブル行の背景色を決定するユーティリティ

export const TABLE_ROW_COLORS = {
  normal: 'hover:bg-gray-50',
  warning: 'bg-yellow-50 hover:bg-yellow-100',
  danger: 'bg-red-50 hover:bg-red-100',
  success: 'bg-green-50 hover:bg-green-100',
} as const

export type TableRowColorType = keyof typeof TABLE_ROW_COLORS

export function getTableRowColor(colorType: TableRowColorType): string {
  return TABLE_ROW_COLORS[colorType]
}

// 条件に基づいて色を決定するヘルパー
export function getConditionalRowColor(
  condition: boolean, 
  trueColor: TableRowColorType = 'danger',
  falseColor: TableRowColorType = 'normal'
): string {
  return getTableRowColor(condition ? trueColor : falseColor)
}