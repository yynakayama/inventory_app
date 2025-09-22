'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import RouteGuard from '@/components/guards/RouteGuard'
import PermissionGuard from '@/components/guards/PermissionGuard'

export default function MasterManagementPage() {
  return (
    <div style={{ padding: '20px' }}>
      <h1>TEST: Master Management Page</h1>
      <p>This should show and then redirect</p>
      <MasterRedirect />
    </div>
  )
}

function MasterRedirect() {
  const router = useRouter()

  useEffect(() => {
    console.log('MasterRedirect useEffect triggered')
    // 設計書に従って部品マスターにリダイレクト
    setTimeout(() => {
      console.log('Redirecting to /master/parts')
      router.replace('/master/parts')
    }, 2000) // 2秒後にリダイレクト
  }, [router])

  return (
    <div>
      <p>Redirecting in 2 seconds...</p>
    </div>
  )
}