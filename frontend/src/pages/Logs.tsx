import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getLogs, clearLogs } from '../lib/api'
import { Trash2, AlertCircle, Info, AlertTriangle, XCircle } from 'lucide-react'

export default function Logs() {
  const queryClient = useQueryClient()

  const { data: logs, isLoading } = useQuery({
    queryKey: ['logs'],
    queryFn: () => getLogs(500),
    refetchInterval: 10000,
  })

  const clearMutation = useMutation({
    mutationFn: () => clearLogs(30),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['logs'] })
    },
  })

  const getLevelIcon = (level: string) => {
    switch (level) {
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />
      case 'info':
        return <Info className="h-4 w-4 text-blue-500" />
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />
    }
  }

  const getLevelClass = (level: string) => {
    switch (level) {
      case 'error':
        return 'bg-red-50 border-red-100'
      case 'warning':
        return 'bg-yellow-50 border-yellow-100'
      case 'info':
        return 'bg-blue-50 border-blue-100'
      default:
        return 'bg-gray-50 border-gray-100'
    }
  }

  if (isLoading) {
    return <div className="flex items-center justify-center h-64">Loading...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Logs</h1>
        <button
          onClick={() => {
            if (confirm('Clear logs older than 30 days?')) {
              clearMutation.mutate()
            }
          }}
          className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50"
        >
          <Trash2 className="h-4 w-4" />
          Clear Old Logs
        </button>
      </div>

      <div className="bg-white rounded-lg border">
        <div className="divide-y max-h-[calc(100vh-200px)] overflow-y-auto">
          {logs?.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No logs yet</div>
          ) : (
            logs?.map((log: any, index: number) => (
              <div key={index} className={`p-3 flex items-start gap-3 ${getLevelClass(log.level)}`}>
                {getLevelIcon(log.level)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900">{log.message}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(log.timestamp).toLocaleString()}
                    {log.backup_id && (
                      <span className="ml-2 font-mono text-xs bg-gray-200 px-1 rounded">
                        {log.backup_id.slice(0, 8)}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
