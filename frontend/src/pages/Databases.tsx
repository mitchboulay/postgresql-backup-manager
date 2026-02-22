import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getDatabases, createDatabase, updateDatabase, deleteDatabase, testDatabase, testNewDatabase, runBackup } from '../lib/api'
import { Plus, Trash2, Play, CheckCircle, XCircle, Loader2, Pencil, X } from 'lucide-react'

interface DatabaseForm {
  name: string
  host: string
  port: number
  database: string
  username: string
  password: string
  schema_name: string
  ssl_mode: string
  environment: 'prod' | 'dev'
}

const defaultForm: DatabaseForm = {
  name: '',
  host: '',
  port: 5432,
  database: 'postgres',
  username: 'postgres',
  password: '',
  schema_name: '',
  ssl_mode: 'require',
  environment: 'dev',
}

export default function Databases() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<DatabaseForm>(defaultForm)
  const [testResult, setTestResult] = useState<any>(null)
  const [testingId, setTestingId] = useState<string | null>(null)

  // Backup dialog state
  const [backupDialog, setBackupDialog] = useState<{ open: boolean; dbId: string; dbName: string } | null>(null)
  const [backupName, setBackupName] = useState('')
  const [localOnly, setLocalOnly] = useState(false)

  const { data: databases, isLoading } = useQuery({
    queryKey: ['databases'],
    queryFn: getDatabases,
  })

  const createMutation = useMutation({
    mutationFn: createDatabase,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['databases'] })
      setShowForm(false)
      setEditingId(null)
      setForm(defaultForm)
      setTestResult(null)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<DatabaseForm> }) => updateDatabase(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['databases'] })
      setShowForm(false)
      setEditingId(null)
      setForm(defaultForm)
      setTestResult(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteDatabase,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['databases'] })
    },
  })

  const backupMutation = useMutation({
    mutationFn: ({ dbId, customName, localOnly }: { dbId: string; customName?: string; localOnly?: boolean }) =>
      runBackup(dbId, { customName, localOnly }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups'] })
      setBackupDialog(null)
      setBackupName('')
      setLocalOnly(false)
    },
  })

  const handleBackupClick = (db: any) => {
    setBackupDialog({ open: true, dbId: db.id, dbName: db.name })
    setBackupName('')
    setLocalOnly(false)
  }

  const handleRunBackup = () => {
    if (backupDialog) {
      backupMutation.mutate({
        dbId: backupDialog.dbId,
        customName: backupName.trim() || undefined,
        localOnly,
      })
    }
  }

  const handleTest = async () => {
    setTestResult(null)
    try {
      const result = await testNewDatabase(form)
      setTestResult(result)
    } catch (error: any) {
      setTestResult({ success: false, error: error.response?.data?.detail || error.message })
    }
  }

  const handleTestExisting = async (id: string) => {
    setTestingId(id)
    try {
      const result = await testDatabase(id)
      alert(result.success ? 'Connection successful!' : `Connection failed: ${result.error}`)
    } catch (error: any) {
      alert(`Test failed: ${error.response?.data?.detail || error.message}`)
    }
    setTestingId(null)
  }

  const handleEdit = (db: any) => {
    setEditingId(db.id)
    setForm({
      name: db.name,
      host: db.host,
      port: db.port,
      database: db.database,
      username: db.username,
      password: '', // Don't prefill password for security
      schema_name: db.schema_name || '',
      ssl_mode: db.ssl_mode || 'require',
      environment: db.environment || 'dev',
    })
    setShowForm(true)
    setTestResult(null)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (editingId) {
      // For updates, only send fields that have values (don't send empty password)
      const updateData: Partial<DatabaseForm> = { ...form }
      if (!updateData.password) {
        delete updateData.password
      }
      updateMutation.mutate({ id: editingId, data: updateData })
    } else {
      createMutation.mutate(form)
    }
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingId(null)
    setForm(defaultForm)
    setTestResult(null)
  }

  if (isLoading) {
    return <div className="flex items-center justify-center h-64">Loading...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Databases</h1>
        <button
          onClick={() => {
            setEditingId(null)
            setForm(defaultForm)
            setTestResult(null)
            setShowForm(true)
          }}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Add Database
        </button>
      </div>

      {/* Add/Edit Database Form */}
      {showForm && (
        <div className="bg-white rounded-lg border p-6">
          <h2 className="text-lg font-semibold mb-4">
            {editingId ? 'Edit Database' : 'Add New Database'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="My Database"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Host</label>
                <input
                  type="text"
                  value={form.host}
                  onChange={(e) => setForm({ ...form, host: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="db.example.supabase.co"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
                <input
                  type="number"
                  value={form.port}
                  onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) })}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Database</label>
                <input
                  type="text"
                  value={form.database}
                  onChange={(e) => setForm({ ...form, database: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                <input
                  type="text"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password {editingId && <span className="text-gray-400 font-normal">(leave blank to keep current)</span>}
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                  required={!editingId}
                  placeholder={editingId ? '••••••••' : ''}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Schema (optional)</label>
                <input
                  type="text"
                  value={form.schema_name}
                  onChange={(e) => setForm({ ...form, schema_name: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="public"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SSL Mode</label>
                <select
                  value={form.ssl_mode}
                  onChange={(e) => setForm({ ...form, ssl_mode: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                >
                  <option value="require">Require</option>
                  <option value="prefer">Prefer</option>
                  <option value="disable">Disable</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Environment</label>
                <select
                  value={form.environment}
                  onChange={(e) => setForm({ ...form, environment: e.target.value as 'prod' | 'dev' })}
                  className="w-full border rounded-lg px-3 py-2"
                >
                  <option value="dev">Development</option>
                  <option value="prod">Production</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Production databases have extra restore protections
                </p>
              </div>
            </div>

            {testResult && (
              <div className={`p-4 rounded-lg ${testResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                {testResult.success ? (
                  <div className="flex items-center gap-2 text-green-700">
                    <CheckCircle className="h-5 w-5" />
                    <span>Connection successful! {testResult.tables?.length} tables found.</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-red-700">
                    <XCircle className="h-5 w-5" />
                    <span>{testResult.error}</span>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleTest}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Test Connection
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {(createMutation.isPending || updateMutation.isPending)
                  ? 'Saving...'
                  : editingId
                    ? 'Update Database'
                    : 'Save Database'}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Database List */}
      <div className="bg-white rounded-lg border">
        <div className="divide-y">
          {databases?.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No databases configured. Add one to get started.
            </div>
          ) : (
            databases?.map((db: any) => (
              <div key={db.id} className="p-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{db.name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      db.environment === 'prod'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {db.environment === 'prod' ? 'Production' : 'Development'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500">
                    {db.host}:{db.port}/{db.database}
                    {db.schema && <span className="ml-2">({db.schema})</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleEdit(db)}
                    className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                    title="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleTestExisting(db.id)}
                    disabled={testingId === db.id}
                    className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                    title="Test Connection"
                  >
                    {testingId === db.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => handleBackupClick(db)}
                    disabled={backupMutation.isPending}
                    className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded"
                    title="Run Backup"
                  >
                    <Play className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Delete this database configuration?')) {
                        deleteMutation.mutate(db.id)
                      }
                    }}
                    className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Backup Name Dialog */}
      {backupDialog?.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">Run Backup</h3>
              <button
                onClick={() => {
                  setBackupDialog(null)
                  setBackupName('')
                  setLocalOnly(false)
                }}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-sm text-gray-600">
                Running backup for <span className="font-medium">{backupDialog.dbName}</span>
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Backup Name <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={backupName}
                  onChange={(e) => setBackupName(e.target.value)}
                  placeholder={`${backupDialog.dbName}_YYYYMMDD_HHMMSS`}
                  className="w-full border rounded-lg px-3 py-2"
                  autoFocus
                />
                <p className="text-xs text-gray-500 mt-1">
                  Leave blank to use the default naming format
                </p>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-gray-700">Storage</p>
                  <p className="text-xs text-gray-500">
                    {localOnly ? 'Save to local disk only' : 'Save locally and upload to S3'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setLocalOnly(false)}
                    className={`px-3 py-1.5 text-sm rounded-l-lg border ${
                      !localOnly
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    Local + S3
                  </button>
                  <button
                    type="button"
                    onClick={() => setLocalOnly(true)}
                    className={`px-3 py-1.5 text-sm rounded-r-lg border-t border-r border-b ${
                      localOnly
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    Local Only
                  </button>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-4 border-t bg-gray-50 rounded-b-lg">
              <button
                onClick={() => {
                  setBackupDialog(null)
                  setBackupName('')
                  setLocalOnly(false)
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleRunBackup}
                disabled={backupMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {backupMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    Run Backup
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
