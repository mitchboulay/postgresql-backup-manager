import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getSettings, updateSettings, testS3, generateEncryptionKey, testEmail } from '../lib/api'
import { Save, RefreshCw, CheckCircle, XCircle, Key, Mail } from 'lucide-react'

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<any>({})
  const [s3TestResult, setS3TestResult] = useState<any>(null)
  const [emailTestResult, setEmailTestResult] = useState<any>(null)
  const [emailTesting, setEmailTesting] = useState(false)

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
  })

  useEffect(() => {
    if (settings) {
      setForm(settings)
    }
  }, [settings])

  const updateMutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      alert('Settings saved!')
    },
  })

  const handleTestS3 = async () => {
    setS3TestResult(null)
    try {
      const result = await testS3()
      setS3TestResult(result)
    } catch (error: any) {
      setS3TestResult({ success: false, error: error.response?.data?.detail || error.message })
    }
  }

  const handleGenerateKey = async () => {
    try {
      const result = await generateEncryptionKey()
      setForm({ ...form, encryption_key: result.key })
    } catch (error: any) {
      alert('Failed to generate key: ' + error.message)
    }
  }

  const handleTestEmail = async () => {
    setEmailTestResult(null)
    setEmailTesting(true)
    try {
      const result = await testEmail()
      setEmailTestResult({ success: true, message: result.message })
    } catch (error: any) {
      setEmailTestResult({ success: false, error: error.response?.data?.detail || error.message })
    } finally {
      setEmailTesting(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Only send changed fields
    const updates: any = {}
    Object.keys(form).forEach(key => {
      if (form[key] !== settings[key] && form[key] !== '********') {
        updates[key] = form[key]
      }
    })
    if (Object.keys(updates).length > 0) {
      updateMutation.mutate(updates)
    }
  }

  if (isLoading) {
    return <div className="flex items-center justify-center h-64">Loading...</div>
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Encryption Settings */}
        <div className="bg-white rounded-lg border p-6">
          <h2 className="text-lg font-semibold mb-4">Encryption</h2>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="encryption_enabled"
                checked={form.encryption_enabled || false}
                onChange={(e) => setForm({ ...form, encryption_enabled: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor="encryption_enabled" className="text-sm font-medium text-gray-700">
                Enable backup encryption (AES-256)
              </label>
            </div>

            {form.encryption_enabled && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Encryption Key</label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={form.encryption_key || ''}
                    onChange={(e) => setForm({ ...form, encryption_key: e.target.value })}
                    className="flex-1 border rounded-lg px-3 py-2"
                    placeholder="Enter or generate a key"
                  />
                  <button
                    type="button"
                    onClick={handleGenerateKey}
                    className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50"
                  >
                    <Key className="h-4 w-4" />
                    Generate
                  </button>
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  Store this key securely! You'll need it to decrypt backups.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* S3 Settings */}
        <div className="bg-white rounded-lg border p-6">
          <h2 className="text-lg font-semibold mb-4">S3 Backup Storage</h2>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="s3_enabled"
                checked={form.s3_enabled || false}
                onChange={(e) => setForm({ ...form, s3_enabled: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor="s3_enabled" className="text-sm font-medium text-gray-700">
                Enable S3 backup upload
              </label>
            </div>

            {form.s3_enabled && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bucket Name</label>
                  <input
                    type="text"
                    value={form.s3_bucket || ''}
                    onChange={(e) => setForm({ ...form, s3_bucket: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="my-backup-bucket"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Region</label>
                  <input
                    type="text"
                    value={form.s3_region || 'us-east-1'}
                    onChange={(e) => setForm({ ...form, s3_region: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Access Key</label>
                  <input
                    type="text"
                    value={form.s3_access_key || ''}
                    onChange={(e) => setForm({ ...form, s3_access_key: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="AKIAIOSFODNN7EXAMPLE"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Secret Key</label>
                  <input
                    type="password"
                    value={form.s3_secret_key || ''}
                    onChange={(e) => setForm({ ...form, s3_secret_key: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Key Prefix</label>
                  <input
                    type="text"
                    value={form.s3_prefix || ''}
                    onChange={(e) => setForm({ ...form, s3_prefix: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="pg-backups/"
                  />
                </div>
                <div className="col-span-2">
                  <button
                    type="button"
                    onClick={handleTestS3}
                    className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Test S3 Connection
                  </button>
                  {s3TestResult && (
                    <div className={`mt-2 p-3 rounded-lg ${s3TestResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                      <div className="flex items-center gap-2">
                        {s3TestResult.success ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                        {s3TestResult.success ? 'Connection successful!' : s3TestResult.error}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Retention Settings */}
        <div className="bg-white rounded-lg border p-6">
          <h2 className="text-lg font-semibold mb-4">Retention Policy</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Keep Daily (days)</label>
              <input
                type="number"
                value={form.retention_days || 30}
                onChange={(e) => setForm({ ...form, retention_days: parseInt(e.target.value) })}
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Keep Weekly (weeks)</label>
              <input
                type="number"
                value={form.retention_weeks || 4}
                onChange={(e) => setForm({ ...form, retention_weeks: parseInt(e.target.value) })}
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Keep Monthly (months)</label>
              <input
                type="number"
                value={form.retention_months || 12}
                onChange={(e) => setForm({ ...form, retention_months: parseInt(e.target.value) })}
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
          </div>
        </div>

        {/* Storage Path */}
        <div className="bg-white rounded-lg border p-6">
          <h2 className="text-lg font-semibold mb-4">Storage</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Backup Path</label>
            <input
              type="text"
              value={form.backup_path || '/backups'}
              onChange={(e) => setForm({ ...form, backup_path: e.target.value })}
              className="w-full border rounded-lg px-3 py-2"
            />
            <p className="text-sm text-gray-500 mt-1">
              Local path where backups are stored
            </p>
          </div>
        </div>

        {/* Email Notifications */}
        <div className="bg-white rounded-lg border p-6">
          <h2 className="text-lg font-semibold mb-4">Email Notifications</h2>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="email_enabled"
                checked={form.email_enabled || false}
                onChange={(e) => setForm({ ...form, email_enabled: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor="email_enabled" className="text-sm font-medium text-gray-700">
                Send email notifications on backup failures
              </label>
            </div>

            {form.email_enabled && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Recipient Email</label>
                  <input
                    type="email"
                    value={form.email_recipient || ''}
                    onChange={(e) => setForm({ ...form, email_recipient: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="alerts@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sender Email</label>
                  <input
                    type="email"
                    value={form.email_sender || ''}
                    onChange={(e) => setForm({ ...form, email_sender: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="no-reply@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">AWS Region (SES)</label>
                  <input
                    type="text"
                    value={form.aws_region || 'us-east-1'}
                    onChange={(e) => setForm({ ...form, aws_region: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">AWS Access Key</label>
                  <input
                    type="text"
                    value={form.aws_access_key || ''}
                    onChange={(e) => setForm({ ...form, aws_access_key: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="AKIAIOSFODNN7EXAMPLE"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">AWS Secret Key</label>
                  <input
                    type="password"
                    value={form.aws_secret_key || ''}
                    onChange={(e) => setForm({ ...form, aws_secret_key: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                  />
                </div>
                <div className="col-span-2">
                  <button
                    type="button"
                    onClick={handleTestEmail}
                    disabled={emailTesting}
                    className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  >
                    <Mail className="h-4 w-4" />
                    {emailTesting ? 'Sending...' : 'Send Test Email'}
                  </button>
                  {emailTestResult && (
                    <div className={`mt-2 p-3 rounded-lg ${emailTestResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                      <div className="flex items-center gap-2">
                        {emailTestResult.success ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                        {emailTestResult.success ? emailTestResult.message : emailTestResult.error}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={updateMutation.isPending}
            className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {updateMutation.isPending ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  )
}
