import { ReactNode } from 'react'
import Button from './Button'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showFooter?: boolean
  footerActions?: ReactNode
  className?: string
}

export default function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = 'md',
  showFooter = true,
  footerActions,
  className = ''
}: ModalProps) {
  if (!isOpen) return null

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl'
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className={`bg-white rounded-lg ${sizeClasses[size]} w-full mx-4 max-h-[90vh] overflow-y-auto ${className}`}>
        {/* ヘッダー */}
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          {description && (
            <p className="text-sm text-gray-600 mt-1">{description}</p>
          )}
        </div>
        
        {/* コンテンツ */}
        <div className="px-6 py-4">
          {children}
        </div>
        
        {/* フッター */}
        {showFooter && (
          <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
            {footerActions || (
              <Button
                variant="secondary"
                onClick={onClose}
              >
                閉じる
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}