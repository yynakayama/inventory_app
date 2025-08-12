'use client'

import { useState, useEffect, useRef } from 'react'

interface Part {
  part_code: string
  specification: string | null
  unit: string
  supplier: string | null
  category: string | null
}

interface PartCodeSelectorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export default function PartCodeSelector({
  value,
  onChange,
  placeholder = "部材コードを入力...",
  className = "",
  disabled = false
}: PartCodeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [parts, setParts] = useState<Part[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // 初期化時に部品一覧を取得
  useEffect(() => {
    fetchParts('')
  }, [])

  // 部品一覧を取得
  const fetchParts = async (search: string) => {
    try {
      setIsLoading(true)
      setError('')
      
      const token = localStorage.getItem('token')
      const params = new URLSearchParams()
      if (search.trim()) {
        params.append('search', search.trim())
      }
      params.append('limit', '20') // 最大20件に制限
      
      const url = `http://localhost:3000/api/parts?${params.toString()}`
      
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      if (!response.ok) {
        throw new Error('部品一覧の取得に失敗しました')
      }
      
      const result = await response.json()
      
      if (result.success && Array.isArray(result.data)) {
        setParts(result.data)
      } else {
        setParts([])
      }
    } catch (err) {
      console.error('部品一覧取得エラー:', err)
      setError(err instanceof Error ? err.message : '部品一覧の取得エラー')
      setParts([])
    } finally {
      setIsLoading(false)
    }
  }

  // 検索語が変更されたときに部品一覧を取得
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        fetchParts(searchTerm)
      }, 300) // 300msのディレイでデバウンス

      return () => clearTimeout(timer)
    }
  }, [searchTerm, isOpen])

  // ドロップダウン外クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // 部品選択時の処理
  const handlePartSelect = (part: Part) => {
    onChange(part.part_code)
    setSearchTerm('')
    setIsOpen(false)
  }

  // 入力フィールドのフォーカス時の処理
  const handleInputFocus = () => {
    if (!disabled) {
      setIsOpen(true)
      if (!searchTerm && !value) {
        fetchParts('')
      }
    }
  }

  // 入力フィールドの変更時の処理
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    onChange(newValue)
    setSearchTerm(newValue)
    setIsOpen(true)
  }

  // フィルタリングされた部品一覧（部品コードのみで検索）
  const filteredParts = parts.filter(part => {
    if (!searchTerm) return true
    const searchLower = searchTerm.toLowerCase()
    return part.part_code.toLowerCase().includes(searchLower)
  })

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
      />
      
      {/* ドロップダウン */}
      {isOpen && (
        <div className="absolute z-[9999] w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
          {isLoading ? (
            <div className="px-3 py-2 text-sm text-gray-500">
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                検索中...
              </div>
            </div>
          ) : error ? (
            <div className="px-3 py-2 text-sm text-red-600">
              {error}
            </div>
          ) : filteredParts.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500">
              {searchTerm ? '該当する部品が見つかりません' : '部品を検索してください'}
            </div>
          ) : (
            <div>
              {filteredParts.map((part) => (
                <button
                  key={part.part_code}
                  type="button"
                  onClick={() => handlePartSelect(part)}
                  className="w-full px-3 py-2 text-left hover:bg-blue-50 focus:bg-blue-50 focus:outline-none border-b border-gray-100 last:border-b-0"
                >
                  <div className="font-medium text-gray-900">
                    {part.part_code}
                  </div>
                  {part.specification && (
                    <div className="text-sm text-gray-600 truncate">
                      {part.specification}
                    </div>
                  )}
                  <div className="text-xs text-gray-500 flex items-center gap-2 mt-1">
                    <span>単位: {part.unit}</span>
                    {part.supplier && <span>仕入先: {part.supplier}</span>}
                    {part.category && <span>カテゴリ: {part.category}</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
