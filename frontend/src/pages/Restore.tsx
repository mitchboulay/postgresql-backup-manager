import { useState, useMemo } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { getS3BackupsForRestore, getDatabases, restoreFromS3, getRestoreStatus } from '../lib/api'
import { Download, Database, AlertTriangle, CheckCircle, Loader2, Search } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

type SortOption = 'newest' | 'oldest' | 'largest' | 'smallest' | 'name'
type FilterOption = 'all' | 'encrypted' | 'unencrypted'

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
  const [confirmProdRestore, setConfirmProdRestore] = useState(false)
  const [sourceDbId, setSourceDbId] = useState('')

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<SortOption>('newest')
  const [filterBy, setFilterBy] = useState<FilterOption>('all')

  const { data: s3Backups, isLoading: loadingBackups } = useQuery({
    queryKey: ['s3-backups-restore'],
    queryFn: getS3BackupsForRestore,
  })

  const { data: databases } = useQuery({
    queryKey: ['databases'],
    queryFn: getDatabases,
  })

  // Filter and sort backups
  const filteredBackups = useMemo(() => {
    if (!s3Backups?.backups) return []

    let result = [...s3Backups.backups]

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter((backup: any) =>
        backup.key.toLowerCase().includes(query)
      )
    }

    // Apply type filter
    if (filterBy === 'encrypted') {
      result = result.filter((backup: any) => backup.key.endsWith('.enc'))
    } else if (filterBy === 'unencrypted') {
      result = result.filter((backup: any) => !backup.key.endsWith('.enc'))
    }

    // Apply sorting
    result.sort((a: any, b: any) => {
      switch (sortBy) {
        case 'newest':
          return new Date(b.last_modified).getTime() - new Date(a.last_modified).getTime()
        case 'oldest':
          return new Date(a.last_modified).getTime() - new Date(b.last_modified).getTime()
        case 'largest':
          return b.size - a.size
        case 'smallest':
          return a.size - b.size
        case 'name':
          return a.key.localeCompare(b.key)
        default:
          return 0
      }
    })

    return result
  }, [s3Backups?.backups, searchQuery, sortBy, filterBy])

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

  // Get environment info for validation
  const getSourceEnv = () => {
    if (!sourceDbId) return 'unknown'
    const db = databases?.find((d: any) => d.id === sourceDbId)
    return db?.environment || 'unknown'
  }

  const getTargetEnv = () => {
    if (targetType === 'existing' && selectedDbId) {
      const db = databases?.find((d: any) => d.id === selectedDbId)
      return db?.environment || 'unknown'
    }
    return 'unknown'
  }

  const getRestoreWarning = () => {
    const sourceEnv = getSourceEnv()
    const targetEnv = getTargetEnv()

    // Block dev -> prod entirely
    if (sourceEnv === 'dev' && targetEnv === 'prod') {
      return {
        type: 'error',
        message: 'Cannot restore dev backup to production. This would overwrite production data with test data.',
      }
    }

    // Any other restore to prod requires confirmation + manual credentials
    if (targetEnv === 'prod') {
      return {
        type: 'warning',
        message: 'You are restoring to a production database. You must enter credentials manually and confirm this action.',
      }
    }

    // Restores to dev are allowed without extra steps
    return null
  }

  // Check if we need manual credentials (any restore to prod)
  const requiresManualCredentials = () => {
    const targetEnv = getTargetEnv()
    return targetEnv === 'prod'
  }

  const handleRestore = () => {
    if (!selectedBackup) {
      alert('Please select a backup to restore')
      return
    }

    const sourceEnv = getSourceEnv()
    const targetEnv = getTargetEnv()

    // Block dev -> prod
    if (sourceEnv === 'dev' && targetEnv === 'prod') {
      alert('Cannot restore a dev backup to production database')
      return
    }

    // Require confirmation for any restore to prod
    if (targetEnv === 'prod' && !confirmProdRestore) {
      alert('Please check the confirmation box to restore to production')
      return
    }

    const isEncrypted = selectedBackup.key.endsWith('.enc')
    setRestoreResult(null)

    // For restores to prod, require manual credentials
    if (requiresManualCredentials()) {
      if (targetType !== 'custom') {
        alert('Restores to production require entering credentials manually for safety')
        setTargetType('custom')
        return
      }
      if (!customDb.host || !customDb.database || !customDb.username || !customDb.password) {
        alert('Please fill in all database connection fields')
        return
      }
      restoreMutation.mutate({
        s3_key: selectedBackup.key,
        target_db: customDb,
        is_encrypted: isEncrypted,
        source_database_id: sourceDbId || undefined,
        confirm_prod_restore: confirmProdRestore,
      })
    } else if (targetType === 'existing') {
      // For dev targets, use stored credentials
      if (!selectedDbId) {
        alert('Please select a target database')
        return
      }
      restoreMutation.mutate({
        s3_key: selectedBackup.key,
        target_database_id: selectedDbId,
        is_encrypted: isEncrypted,
        source_database_id: sourceDbId || undefined,
        confirm_prod_restore: false,
      })
    } else {
      // Custom credentials for dev target
      if (!customDb.host || !customDb.database || !customDb.username || !customDb.password) {
        alert('Please fill in all database connection fields')
        return
      }
      restoreMutation.mutate({
        s3_key: selectedBackup.key,
        target_db: customDb,
        is_encrypted: isEncrypted,
        source_database_id: sourceDbId || undefined,
        confirm_prod_restore: false,
      })
    }
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

          {/* Source Database Selector */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Source Database (where backup came from)
            </label>
            <select
              value={sourceDbId}
              onChange={(e) => setSourceDbId(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Unknown / Not specified</option>
              {databases?.map((db: any) => (
                <option key={db.id} value={db.id}>
                  {db.name} ({db.environment === 'prod' ? 'Production' : 'Development'})
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Select the database this backup originated from for safety checks
            </p>
          </div>

          {/* Search and Filter Controls */}
          <div className="space-y-3 mb-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search backups..."
                className="w-full border rounded-lg pl-9 pr-3 py-2 text-sm"
              />
            </div>

            {/* Filter and Sort Row */}
            <div className="flex gap-2">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="flex-1 border rounded-lg px-3 py-2 text-sm"
              >
                <option value="newest">Most Recent</option>
                <option value="oldest">Oldest First</option>
                <option value="largest">Largest First</option>
                <option value="smallest">Smallest First</option>
                <option value="name">Name (A-Z)</option>
              </select>
              <select
                value={filterBy}
                onChange={(e) => setFilterBy(e.target.value as FilterOption)}
                className="flex-1 border rounded-lg px-3 py-2 text-sm"
              >
                <option value="all">All Types</option>
                <option value="encrypted">Encrypted Only</option>
                <option value="unencrypted">Unencrypted Only</option>
              </select>
            </div>
          </div>

          {loadingBackups ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : filteredBackups.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              {s3Backups?.backups?.length === 0
                ? 'No backups found in S3'
                : 'No backups match your search'}
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-500 mb-2">
                Showing {filteredBackups.length} of {s3Backups?.backups?.length || 0} backups
              </p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {filteredBackups.map((backup: any) => (
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
            </>
          )}
        </div>

        {/* Step 2: Select Target */}
        <div className="bg-white rounded-lg border p-6">
          <h2 className="text-lg font-semibold mb-4">2. Select Target Database</h2>

          <div className="space-y-4">
            {/* Only show radio options if target is dev */}
            {!requiresManualCredentials() ? (
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
            ) : (
              <div className="text-sm text-yellow-700 bg-yellow-50 p-3 rounded-lg">
                Restores to production require entering credentials manually.
              </div>
            )}

            {targetType === 'existing' && !requiresManualCredentials() ? (
              <div>
                <select
                  value={selectedDbId}
                  onChange={(e) => {
                    setSelectedDbId(e.target.value)
                    setConfirmProdRestore(false) // Reset confirmation when target changes
                  }}
                  className="w-full border rounded-lg px-3 py-2"
                >
                  <option value="">Select a database...</option>
                  {databases?.map((db: any) => (
                    <option key={db.id} value={db.id}>
                      {db.name} ({db.environment === 'prod' ? '🔴 PROD' : '🟢 DEV'}) - {db.host}:{db.port}/{db.database}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-2">
                  Stored credentials will be used for dev/unknown restores
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

      {/* Environment Warning */}
      {getRestoreWarning() && (
        <div className={`rounded-lg border p-4 ${
          getRestoreWarning()?.type === 'error'
            ? 'bg-red-50 border-red-200'
            : 'bg-yellow-50 border-yellow-200'
        }`}>
          <div className="flex items-start gap-3">
            <AlertTriangle className={`h-5 w-5 mt-0.5 ${
              getRestoreWarning()?.type === 'error' ? 'text-red-600' : 'text-yellow-600'
            }`} />
            <div className="flex-1">
              <h3 className={`font-medium ${
                getRestoreWarning()?.type === 'error' ? 'text-red-800' : 'text-yellow-800'
              }`}>
                {getRestoreWarning()?.type === 'error' ? 'Restore Blocked' : 'Confirmation Required'}
              </h3>
              <p className={`text-sm mt-1 ${
                getRestoreWarning()?.type === 'error' ? 'text-red-700' : 'text-yellow-700'
              }`}>
                {getRestoreWarning()?.message}
              </p>

              {/* Confirmation checkbox for prod->prod */}
              {getRestoreWarning()?.type === 'warning' && (
                <label className="flex items-center gap-2 mt-3">
                  <input
                    type="checkbox"
                    checked={confirmProdRestore}
                    onChange={(e) => setConfirmProdRestore(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <span className="text-sm font-medium text-yellow-800">
                    I understand I am restoring production data to production
                  </span>
                </label>
              )}
            </div>
          </div>
        </div>
      )}

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
            {sourceDbId && selectedDbId && (
              <p className="text-xs text-gray-400 mt-1">
                {getSourceEnv() === 'prod' ? '🔴 Production' : '🟢 Development'} → {getTargetEnv() === 'prod' ? '🔴 Production' : '🟢 Development'}
              </p>
            )}
          </div>
          <button
            onClick={handleRestore}
            disabled={
              !selectedBackup ||
              restoreMutation.isPending ||
              isPolling ||
              getRestoreWarning()?.type === 'error' ||
              (getRestoreWarning()?.type === 'warning' && !confirmProdRestore)
            }
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
