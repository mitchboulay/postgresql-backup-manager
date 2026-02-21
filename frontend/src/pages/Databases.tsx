import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getDatabases, createDatabase, deleteDatabase, testDatabase, testNewDatabase, runBackup } from '../lib/api'
import { Plus, Trash2, Play, CheckCircle, XCircle, Loader2 } from 'lucide-react'

interface DatabaseForm {
  name: string
  host: string
  port: number
  database: string
  username: string
  password: string
  schema_name: string
  ssl_mode: string
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
}

export default function Databases() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<DatabaseForm>(defaultForm)
  const [testResult, setTestResult] = useState<any>(null)
  const [testingId, setTestingId] = useState<string | null>(null)

  const { data: databases, isLoading } = useQuery({
    queryKey: ['databases'],
    queryFn: getDatabases,
  })

  const createMutation = useMutation({
    mutationFn: createDatabase,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['databases'] })
      setShowForm(false)
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
    mutationFn: runBackup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups'] })
    },
  })

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate(form)
  }

  if (isLoading) {
    return <div className="flex items-center justify-center h-64">Loading...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Databases</h1>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Add Database
        </button>
      </div>

      {/* Add Database Form */}
      {showForm && (
        <div className="bg-white rounded-lg border p-6">
          <h2 className="text-lg font-semibold mb-4">Add New Database</h2>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                  required
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
                disabled={createMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {createMutation.isPending ? 'Saving...' : 'Save Database'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false)
                  setForm(defaultForm)
                  setTestResult(null)
                }}
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
                  <p className="font-medium">{db.name}</p>
                  <p className="text-sm text-gray-500">
                    {db.host}:{db.port}/{db.database}
                    {db.schema && <span className="ml-2">({db.schema})</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleTestExisting(db.id)}
                    disabled={testingId === db.id}
                    className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                    title="Test Connection"
                  >
                    {testingId === db.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => backupMutation.mutate(db.id)}
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
    </div>
  )
}
