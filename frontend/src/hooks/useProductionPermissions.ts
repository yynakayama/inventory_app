import { useAuth } from '@/providers/AuthProvider'

export function useProductionPermissions() {
  const { user } = useAuth()
  
  const canManageProduction = () => {
    if (!user?.role) return false
    return ['admin', 'production_manager'].includes(user.role)
  }

  const canViewProduction = () => {
    if (!user?.role) return false
    return ['admin', 'production_manager', 'material_staff', 'viewer'].includes(user.role)
  }

  return {
    canManageProduction,
    canViewProduction,
    isProductionManager: canManageProduction,
    isViewer: !canManageProduction()
  }
}