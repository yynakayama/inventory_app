'use client'

import { ReactNode } from 'react'
import { useAuth, usePermissions, type UserRole } from '@/providers/AuthProvider'

// 権限制御コンポーネントのProps型定義
interface PermissionGuardProps {
  children: ReactNode
  requiredRoles?: UserRole[] // 必要な権限
  requiredPermissions?: string[] // 必要な権限（細かい制御用）
  fallback?: ReactNode // 権限がない場合の代替表示
  hideIfNoAccess?: boolean // アクセス権限がない場合に完全に非表示（デフォルト: true）
}

// 操作別権限定義
const OPERATION_PERMISSIONS = {
  // 在庫管理
  'inventory.view': ['admin', 'production_manager', 'material_staff', 'viewer'] as UserRole[],
  'inventory.create': ['admin', 'material_staff'] as UserRole[],
  'inventory.update': ['admin', 'material_staff'] as UserRole[],
  'inventory.delete': ['admin'] as UserRole[],
  'inventory.receipt': ['admin', 'material_staff'] as UserRole[],
  'inventory.issue': ['admin', 'material_staff'] as UserRole[],
  
  // 生産計画
  'production.view': ['admin', 'production_manager', 'material_staff', 'viewer'] as UserRole[],
  'production.create': ['admin', 'production_manager'] as UserRole[],
  'production.update': ['admin', 'production_manager'] as UserRole[],
  'production.delete': ['admin', 'production_manager'] as UserRole[],
  
  // 予定入荷・調達
  'procurement.view': ['admin', 'production_manager', 'material_staff', 'viewer'] as UserRole[],
  'procurement.create': ['admin', 'production_manager', 'material_staff'] as UserRole[],
  'procurement.update': ['admin', 'production_manager', 'material_staff'] as UserRole[],
  'procurement.delete': ['admin', 'production_manager'] as UserRole[],
  
  // マスタ管理
  'master.view': ['admin', 'production_manager', 'material_staff', 'viewer'] as UserRole[],
  'master.create': ['admin'] as UserRole[],
  'master.update': ['admin'] as UserRole[],
  'master.delete': ['admin'] as UserRole[],
  
  // レポート
  'reports.view': ['admin', 'production_manager', 'material_staff', 'viewer'] as UserRole[],
  'reports.export': ['admin', 'production_manager', 'material_staff'] as UserRole[],
  
  // システム管理
  'system.users': ['admin'] as UserRole[],
  'system.settings': ['admin'] as UserRole[],
} as const

// 権限制御コンポーネント
export default function PermissionGuard({
  children,
  requiredRoles,
  requiredPermissions,
  fallback = null,
  hideIfNoAccess = true
}: PermissionGuardProps) {
  const { user, isAuthenticated } = useAuth()
  const { hasRole, hasAnyRole } = usePermissions()

  // 未認証の場合
  if (!isAuthenticated || !user) {
    return hideIfNoAccess ? null : fallback
  }

  // ロールベースチェック
  if (requiredRoles && requiredRoles.length > 0) {
    const hasRequiredRole = hasAnyRole(requiredRoles)
    if (!hasRequiredRole) {
      return hideIfNoAccess ? null : fallback
    }
  }

  // 権限ベースチェック（細かい制御）
  if (requiredPermissions && requiredPermissions.length > 0) {
    const hasRequiredPermission = requiredPermissions.every(permission => {
      const allowedRoles = OPERATION_PERMISSIONS[permission as keyof typeof OPERATION_PERMISSIONS]
      return allowedRoles && allowedRoles.includes(user.role)
    })
    
    if (!hasRequiredPermission) {
      return hideIfNoAccess ? null : fallback
    }
  }

  // 権限がある場合は子コンポーネントを表示
  return <>{children}</>
}

// 便利なカスタムフック：権限チェック
export function usePermissionCheck() {
  const { user, isAuthenticated } = useAuth()

  const checkPermission = (permission: keyof typeof OPERATION_PERMISSIONS): boolean => {
    if (!isAuthenticated || !user) return false
    
    const allowedRoles = OPERATION_PERMISSIONS[permission]
    return allowedRoles.includes(user.role)
  }

  const checkRole = (roles: UserRole | UserRole[]): boolean => {
    if (!isAuthenticated || !user) return false
    
    const roleArray = Array.isArray(roles) ? roles : [roles]
    return roleArray.includes(user.role)
  }

  return {
    checkPermission,
    checkRole,
    // 便利なショートカット
    canViewInventory: () => checkPermission('inventory.view'),
    canEditInventory: () => checkPermission('inventory.update'),
    canReceiveInventory: () => checkPermission('inventory.receipt'),
    canManageProduction: () => checkPermission('production.create'),
    canManageMaster: () => checkPermission('master.update'),
    isAdmin: () => checkRole('admin'),
    isProductionManager: () => checkRole(['admin', 'production_manager'] as UserRole[]),
    isMaterialStaff: () => checkRole(['admin', 'material_staff'] as UserRole[])
  }
}

// 特定操作用の便利コンポーネント
export function AdminOnly({ children, fallback }: { children: ReactNode, fallback?: ReactNode }) {
  return (
    <PermissionGuard requiredRoles={['admin'] as UserRole[]} fallback={fallback}>
      {children}
    </PermissionGuard>
  )
}

export function ProductionManagerOnly({ children, fallback }: { children: ReactNode, fallback?: ReactNode }) {
  return (
    <PermissionGuard requiredRoles={['admin', 'production_manager'] as UserRole[]} fallback={fallback}>
      {children}
    </PermissionGuard>
  )
}

export function MaterialStaffOnly({ children, fallback }: { children: ReactNode, fallback?: ReactNode }) {
  return (
    <PermissionGuard requiredRoles={['admin', 'material_staff'] as UserRole[]} fallback={fallback}>
      {children}
    </PermissionGuard>
  )
}

// 権限レベル表示用コンポーネント
export function RequiredPermissionBadge({ permission }: { permission: keyof typeof OPERATION_PERMISSIONS }) {
  const allowedRoles = OPERATION_PERMISSIONS[permission]
  
  const roleNames: Record<UserRole, string> = {
    admin: '管理者',
    production_manager: '生産管理者',
    material_staff: '資材担当',
    viewer: '閲覧者'
  }

  return (
    <div className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
      権限: {allowedRoles.map(role => roleNames[role]).join('、')}
    </div>
  )
}