import { useQuery } from '@tanstack/react-query'
import { getHealthDetailed, getBackups } from '../lib/api'
import { CheckCircle, XCircle, AlertCircle, Database, Clock, HardDrive } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

export default function Dashboard() {
  const { data: health, isLoading: healthLoading } = useQuery({
    queryKey: ['health'],
    queryFn: getHealthDetailed,
    refetchInterval: 30000,
  })

  const { data: backups } = useQuery({
    queryKey: ['backups'],
    queryFn: () => getBackups(10),
  })

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="h-8 w-8 text-green-500" />
      case 'degraded':
        return <AlertCircle className="h-8 w-8 text-yellow-500" />
      default:
        return <XCircle className="h-8 w-8 text-red-500" />
    }
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  if (healthLoading) {
    return <div className="flex items-center justify-center h-64">Loading...</div>
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Health Status */}
        <div className="bg-white rounded-lg border p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">System Status</p>
              <p className="text-2xl font-bold capitalize">{health?.status}</p>
            </div>
            {getStatusIcon(health?.status)}
          </div>
        </div>

        {/* Databases */}
        <div className="bg-white rounded-lg border p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Databases</p>
              <p className="text-2xl font-bold">{health?.databases_configured || 0}</p>
            </div>
            <Database className="h-8 w-8 text-blue-500" />
          </div>
        </div>

        {/* Active Schedules */}
        <div className="bg-white rounded-lg border p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Active Schedules</p>
              <p className="text-2xl font-bold">{health?.schedules_active || 0}</p>
            </div>
            <Clock className="h-8 w-8 text-purple-500" />
          </div>
        </div>

        {/* Disk Usage */}
        <div className="bg-white rounded-lg border p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Disk Usage</p>
              <p className="text-2xl font-bold">{health?.disk?.percent_used || 0}%</p>
            </div>
            <HardDrive className="h-8 w-8 text-orange-500" />
          </div>
        </div>
      </div>

      {/* Features Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border p-6">
          <h2 className="text-lg font-semibold mb-4">Features</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Encryption</span>
              <span className={`px-2 py-1 rounded text-sm ${health?.encryption_enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                {health?.encryption_enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">S3 Backup</span>
              <span className={`px-2 py-1 rounded text-sm ${health?.s3_enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                {health?.s3_enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          </div>
        </div>

        {/* Backup Stats */}
        <div className="bg-white rounded-lg border p-6">
          <h2 className="text-lg font-semibold mb-4">Backup Statistics</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Total Backups</span>
              <span className="font-medium">{health?.backup_stats?.total_backups || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Successful</span>
              <span className="font-medium text-green-600">{health?.backup_stats?.successful || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Failed</span>
              <span className="font-medium text-red-600">{health?.backup_stats?.failed || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Total Size</span>
              <span className="font-medium">{formatBytes(health?.backup_stats?.total_size || 0)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Backups */}
      <div className="bg-white rounded-lg border">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold">Recent Backups</h2>
        </div>
        <div className="divide-y">
          {backups?.length === 0 ? (
            <div className="p-6 text-center text-gray-500">No backups yet</div>
          ) : (
            backups?.slice(0, 5).map((backup: any) => (
              <div key={backup.id} className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">{backup.database_name}</p>
                  <p className="text-sm text-gray-500">
                    {backup.completed_at
                      ? formatDistanceToNow(new Date(backup.completed_at), { addSuffix: true })
                      : 'In progress...'}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  {backup.file_size && (
                    <span className="text-sm text-gray-500">{formatBytes(backup.file_size)}</span>
                  )}
                  <span
                    className={`px-2 py-1 rounded text-sm ${
                      backup.status === 'completed'
                        ? 'bg-green-100 text-green-700'
                        : backup.status === 'failed'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}
                  >
                    {backup.status}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
