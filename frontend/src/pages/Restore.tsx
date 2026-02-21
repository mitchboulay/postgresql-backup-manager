import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { getS3BackupsForRestore, getDatabases, restoreFromS3, getRestoreStatus } from '../lib/api'
import { Download, Database, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

export default function RestorePage() {
  const [selectedBackup, setSelectedBackup] = useState<any>(null)
  const [targetType, setTargetType] = useState<'existing' | 'custom'>('existing')
  const [selectedDbId, setSelectedDbId] = useState('')
  const [customDb, setCustomDb] = useState({
    host: '',
    port: 5432,
    database: '',
    username: '',
    password: '',
    ssl_mode: 'require',
  })
  const [restoreResult, setRestoreResult] = useState<any>(null)
  const [isPolling, setIsPolling] = useState(false)

  const { data: s3Backups, isLoading: loadingBackups } = useQuery({
    queryKey: ['s3-backups-restore'],
    queryFn: getS3BackupsForRestore,
  })

  const { data: databases } = useQuery({
    queryKey: ['databases'],
    queryFn: getDatabases,
  })

  const pollForStatus = async (jobId: string) => {
    setIsPolling(true)
    const maxAttempts = 120 // 10 minutes max
    let attempts = 0

    while (attempts < maxAttempts) {
      try {
        const status = await getRestoreStatus(jobId)
        if (status.status === 'completed') {
          setRestoreResult({ success: true, data: status })
          setIsPolling(false)
          return
        } else if (status.status === 'failed') {
          setRestoreResult({ success: false, error: status.error || 'Restore failed' })
          setIsPolling(false)
          return
        }
        // Still running, wait and poll again
        await new Promise(resolve => setTimeout(resolve, 5000))
        attempts++
      } catch {
        setRestoreResult({ success: false, error: 'Failed to check restore status' })
        setIsPolling(false)
        return
      }
    }
    setRestoreResult({ success: false, error: 'Restore timed out' })
    setIsPolling(false)
  }

  const restoreMutation = useMutation({
    mutationFn: restoreFromS3,
    onSuccess: (data) => {
      setRestoreResult({ success: true, data: { status: 'running', message: data.message } })
      // Start polling
      pollForStatus(data.job_id)
    },
    onError: (error: any) => {
      setRestoreResult({ success: false, error: error.response?.data?.detail || error.message })
    },
  })

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const handleRestore = () => {
    if (!selectedBackup) {
      alert('Please select a backup to restore')
      return
    }

    let targetDb
    if (targetType === 'existing') {
      const db = databases?.find((d: any) => d.id === selectedDbId)
      if (!db) {
        alert('Please select a target database')
        return
      }
      // Need to get the full db config with password - for now use custom
      alert('For security, please enter the database credentials manually')
      setTargetType('custom')
      return
    } else {
      if (!customDb.host || !customDb.database || !customDb.username || !customDb.password) {
        alert('Please fill in all database connection fields')
        return
      }
      targetDb = customDb
    }

    const isEncrypted = selectedBackup.key.endsWith('.enc')

    setRestoreResult(null)
    restoreMutation.mutate({
      s3_key: selectedBackup.key,
      target_db: targetDb,
      is_encrypted: isEncrypted,
    })
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Restore from Backup</h1>

      {/* Warning */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
          <div>
            <h3 className="font-medium text-yellow-800">Warning: Destructive Operation</h3>
            <p className="text-sm text-yellow-700 mt-1">
              Restoring a backup will overwrite existing data in the target database.
              Make sure you have selected the correct backup and target database.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Step 1: Select Backup */}
        <div className="bg-white rounded-lg border p-6">
          <h2 className="text-lg font-semibold mb-4">1. Select Backup from S3</h2>

          {loadingBackups ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : s3Backups?.backups?.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              No backups found in S3
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {s3Backups?.backups?.map((backup: any) => (
                <div
                  key={backup.key}
                  onClick={() => setSelectedBackup(backup)}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedBackup?.key === backup.key
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Database className="h-4 w-4 text-gray-400" />
                      <span className="font-medium text-sm truncate max-w-[200px]">
                        {backup.key.split('/').pop()}
                      </span>
                    </div>
                    {backup.key.endsWith('.enc') && (
                      <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                        Encrypted
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                    <span>{formatBytes(backup.size)}</span>
                    <span>
                      {formatDistanceToNow(new Date(backup.last_modified), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Step 2: Select Target */}
        <div className="bg-white rounded-lg border p-6">
          <h2 className="text-lg font-semibold mb-4">2. Select Target Database</h2>

          <div className="space-y-4">
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={targetType === 'existing'}
                  onChange={() => setTargetType('existing')}
                  className="h-4 w-4"
                />
                <span className="text-sm">Existing Database</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={targetType === 'custom'}
                  onChange={() => setTargetType('custom')}
                  className="h-4 w-4"
                />
                <span className="text-sm">Custom Connection</span>
              </label>
            </div>

            {targetType === 'existing' ? (
              <div>
                <select
                  value={selectedDbId}
                  onChange={(e) => setSelectedDbId(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2"
                >
                  <option value="">Select a database...</option>
                  {databases?.map((db: any) => (
                    <option key={db.id} value={db.id}>
                      {db.name} ({db.host}:{db.port}/{db.database})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-2">
                  You'll need to enter credentials for security
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Host</label>
                  <input
                    type="text"
                    value={customDb.host}
                    onChange={(e) => setCustomDb({ ...customDb, host: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    placeholder="db.example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
                  <input
                    type="number"
                    value={customDb.port}
                    onChange={(e) => setCustomDb({ ...customDb, port: parseInt(e.target.value) })}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Database</label>
                  <input
                    type="text"
                    value={customDb.database}
                    onChange={(e) => setCustomDb({ ...customDb, database: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    placeholder="postgres"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                  <input
                    type="text"
                    value={customDb.username}
                    onChange={(e) => setCustomDb({ ...customDb, username: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    placeholder="postgres"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <input
                    type="password"
                    value={customDb.password}
                    onChange={(e) => setCustomDb({ ...customDb, password: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">SSL Mode</label>
                  <select
                    value={customDb.ssl_mode}
                    onChange={(e) => setCustomDb({ ...customDb, ssl_mode: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="require">require</option>
                    <option value="prefer">prefer</option>
                    <option value="disable">disable</option>
                    <option value="verify-full">verify-full</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Restore Button */}
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium">Ready to restore?</h3>
            <p className="text-sm text-gray-500">
              {selectedBackup
                ? `Selected: ${selectedBackup.key.split('/').pop()}`
                : 'Select a backup from the list above'}
            </p>
          </div>
          <button
            onClick={handleRestore}
            disabled={!selectedBackup || restoreMutation.isPending || isPolling}
            className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {restoreMutation.isPending || isPolling ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {isPolling ? 'Restoring...' : 'Starting...'}
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Restore Backup
              </>
            )}
          </button>
        </div>

        {/* Result */}
        {restoreResult && (
          <div className={`mt-4 p-4 rounded-lg ${
            isPolling ? 'bg-blue-50' : restoreResult.success ? 'bg-green-50' : 'bg-red-50'
          }`}>
            <div className="flex items-start gap-3">
              {isPolling ? (
                <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
              ) : restoreResult.success ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-red-600" />
              )}
              <div>
                <h4 className={`font-medium ${
                  isPolling ? 'text-blue-800' : restoreResult.success ? 'text-green-800' : 'text-red-800'
                }`}>
                  {isPolling
                    ? 'Restore in Progress...'
                    : restoreResult.success
                      ? 'Restore Completed Successfully'
                      : 'Restore Failed'}
                </h4>
                {isPolling ? (
                  <p className="text-sm text-blue-700 mt-1">
                    Downloading from S3 and restoring to database. This may take a few minutes.
                  </p>
                ) : restoreResult.success ? (
                  <div className="text-sm text-green-700 mt-1">
                    <p>Target: {restoreResult.data.target_database}</p>
                    {restoreResult.data.duration_seconds && (
                      <p>Duration: {restoreResult.data.duration_seconds?.toFixed(1)}s</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-red-700 mt-1">{restoreResult.error}</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
