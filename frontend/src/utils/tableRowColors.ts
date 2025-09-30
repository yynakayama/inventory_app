// テーブル行の背景色を決定するユーティリティ

export const TABLE_ROW_COLORS = {
  normal: 'hover:bg-gray-50',
  warning: 'bg-yellow-50 hover:bg-yellow-100',
  awaiting: 'bg-yellow-50 bg-opacity-40 hover:bg-yellow-100 hover:bg-opacity-50', // 入荷待ち用（薄い黄色）
  danger: 'bg-red-50 hover:bg-red-100',
  success: 'bg-green-50 hover:bg-green-100',
} as const

export type TableRowColorType = keyof typeof TABLE_ROW_COLORS

export function getTableRowColor(colorType: TableRowColorType): string {
  return TABLE_ROW_COLORS[colorType]
}

// 条件に基づいて色を決定するヘルパー（2段階）
export function getConditionalRowColor(
  condition: boolean,
  trueColor: TableRowColorType = 'danger',
  falseColor: TableRowColorType = 'normal'
): string {
  return getTableRowColor(condition ? trueColor : falseColor)
}

// 3段階の優先度に基づいて色を決定するヘルパー
export function getThreeStageRowColor(
  urgentCondition: boolean,
  warningCondition: boolean,
  urgentColor: TableRowColorType = 'danger',
  warningColor: TableRowColorType = 'awaiting',
  normalColor: TableRowColorType = 'normal'
): string {
  if (urgentCondition) {
    return getTableRowColor(urgentColor)
  }
  if (warningCondition) {
    return getTableRowColor(warningColor)
  }
  return getTableRowColor(normalColor)
}