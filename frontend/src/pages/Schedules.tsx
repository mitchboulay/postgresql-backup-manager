import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getSchedules, getDatabases, createSchedule, deleteSchedule, runScheduleNow, pauseSchedule, resumeSchedule, getCronPresets, validateCron, getSchedulerJobs } from '../lib/api'
import { Plus, Trash2, Play, Pause, PlayCircle } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface ScheduleForm {
  name: string
  database_id: string
  cron_expression: string
  enabled: boolean
  description: string
}

export default function Schedules() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<ScheduleForm>({
    name: '',
    database_id: '',
    cron_expression: '0 3 * * *',
    enabled: true,
    description: '',
  })
  const [cronValidation, setCronValidation] = useState<any>(null)

  const { data: schedules, isLoading } = useQuery({
    queryKey: ['schedules'],
    queryFn: getSchedules,
  })

  const { data: databases } = useQuery({
    queryKey: ['databases'],
    queryFn: getDatabases,
  })

  const { data: presets } = useQuery({
    queryKey: ['cron-presets'],
    queryFn: getCronPresets,
  })

  const { data: schedulerJobs } = useQuery({
    queryKey: ['scheduler-jobs'],
    queryFn: getSchedulerJobs,
    refetchInterval: 10000, // Refresh every 10 seconds
  })

  // Map job next_run times to schedules
  const jobsMap = schedulerJobs?.reduce((acc: any, job: any) => {
    acc[job.id] = job
    return acc
  }, {}) || {}

  const createMutation = useMutation({
    mutationFn: createSchedule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] })
      setShowForm(false)
      setForm({ name: '', database_id: '', cron_expression: '0 3 * * *', enabled: true, description: '' })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteSchedule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] })
    },
  })

  const runNowMutation = useMutation({
    mutationFn: runScheduleNow,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups'] })
    },
  })

  const pauseMutation = useMutation({
    mutationFn: pauseSchedule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] })
    },
  })

  const resumeMutation = useMutation({
    mutationFn: resumeSchedule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] })
    },
  })

  const handleValidateCron = async (expression: string) => {
    try {
      const result = await validateCron(expression)
      setCronValidation(result)
    } catch {
      setCronValidation({ valid: false, error: 'Invalid expression' })
    }
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
        <h1 className="text-2xl font-bold text-gray-900">Schedules</h1>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Add Schedule
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-lg border p-6">
          <h2 className="text-lg font-semibold mb-4">Add New Schedule</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="Daily Backup"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Database</label>
                <select
                  value={form.database_id}
                  onChange={(e) => setForm({ ...form, database_id: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                  required
                >
                  <option value="">Select database</option>
                  {databases?.map((db: any) => (
                    <option key={db.id} value={db.id}>{db.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cron Expression</label>
                <input
                  type="text"
                  value={form.cron_expression}
                  onChange={(e) => {
                    setForm({ ...form, cron_expression: e.target.value })
                    handleValidateCron(e.target.value)
                  }}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="0 3 * * *"
                  required
                />
                {cronValidation && (
                  <p className={`text-sm mt-1 ${cronValidation.valid ? 'text-green-600' : 'text-red-600'}`}>
                    {cronValidation.valid
                      ? `Next run: ${cronValidation.next_runs?.[0] ? new Date(cronValidation.next_runs[0]).toLocaleString() : 'N/A'}`
                      : cronValidation.error}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Preset</label>
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      setForm({ ...form, cron_expression: e.target.value })
                      handleValidateCron(e.target.value)
                    }
                  }}
                  className="w-full border rounded-lg px-3 py-2"
                >
                  <option value="">Select preset</option>
                  {presets?.map((preset: any) => (
                    <option key={preset.expression} value={preset.expression}>{preset.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {createMutation.isPending ? 'Saving...' : 'Save Schedule'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-lg border">
        <div className="divide-y">
          {schedules?.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No schedules configured. Add one to automate backups.
            </div>
          ) : (
            schedules?.map((schedule: any) => (
              <div key={schedule.id} className="p-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{schedule.name}</p>
                    <span className={`px-2 py-0.5 text-xs rounded ${schedule.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {schedule.enabled ? 'Active' : 'Paused'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500">
                    {schedule.database_name} • <code className="bg-gray-100 px-1 rounded">{schedule.cron_expression}</code>
                  </p>
                  {jobsMap[schedule.id]?.next_run && (
                    <p className="text-sm text-blue-600">
                      Next run: {formatDistanceToNow(new Date(jobsMap[schedule.id].next_run), { addSuffix: true })}
                    </p>
                  )}
                  {schedule.last_run && (
                    <p className="text-sm text-gray-400">
                      Last run: {formatDistanceToNow(new Date(schedule.last_run), { addSuffix: true })}
                      {schedule.last_status && (
                        <span className={schedule.last_status === 'success' ? 'text-green-600' : 'text-red-600'}>
                          {' '}({schedule.last_status})
                        </span>
                      )}
                    </p>
                  )}
                  {!jobsMap[schedule.id] && schedule.enabled && (
                    <p className="text-sm text-yellow-600">Not loaded in scheduler</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => runNowMutation.mutate(schedule.id)}
                    className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded"
                    title="Run Now"
                  >
                    <PlayCircle className="h-4 w-4" />
                  </button>
                  {schedule.enabled ? (
                    <button
                      onClick={() => pauseMutation.mutate(schedule.id)}
                      className="p-2 text-gray-500 hover:text-yellow-600 hover:bg-yellow-50 rounded"
                      title="Pause"
                    >
                      <Pause className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      onClick={() => resumeMutation.mutate(schedule.id)}
                      className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded"
                      title="Resume"
                    >
                      <Play className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (confirm('Delete this schedule?')) {
                        deleteMutation.mutate(schedule.id)
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
