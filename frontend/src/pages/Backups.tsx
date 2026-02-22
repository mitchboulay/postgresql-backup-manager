import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getBackups, getBackupFiles, deleteBackup, deleteBackupFile, uploadToS3 } from '../lib/api'
import { Trash2, Download, Cloud, Lock, CheckCircle, XCircle, Clock } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

export default function Backups() {
  const queryClient = useQueryClient()

  const { data: backups, isLoading } = useQuery({
    queryKey: ['backups'],
    queryFn: () => getBackups(100),
  })

  const { data: files } = useQuery({
    queryKey: ['backup-files'],
    queryFn: getBackupFiles,
  })

  const deleteMutation = useMutation({
    mutationFn: deleteBackup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups'] })
      queryClient.invalidateQueries({ queryKey: ['backup-files'] })
    },
  })

  const deleteFileMutation = useMutation({
    mutationFn: deleteBackupFile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backup-files'] })
    },
  })

  const uploadMutation = useMutation({
    mutationFn: uploadToS3,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups'] })
      alert('Uploaded to S3 successfully!')
    },
    onError: (error: any) => {
      alert(`Upload failed: ${error.response?.data?.detail || error.message}`)
    },
  })

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />
      default:
        return <Clock className="h-4 w-4 text-yellow-500 animate-spin" />
    }
  }

  if (isLoading) {
    return <div className="flex items-center justify-center h-64">Loading...</div>
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Backups</h1>

      {/* Backup History */}
      <div className="bg-white rounded-lg border">
        <div className="p-4 border-b">
          <h2 className="font-semibold">Backup History</h2>
        </div>
        <div className="divide-y max-h-96 overflow-y-auto">
          {backups?.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No backups yet</div>
          ) : (
            backups?.map((backup: any) => (
              <div key={backup.id} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getStatusIcon(backup.status)}
                  <div>
                    <p className="font-medium">{backup.database_name}</p>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <span>
                        {backup.completed_at
                          ? formatDistanceToNow(new Date(backup.completed_at), { addSuffix: true })
                          : 'In progress...'}
                      </span>
                      {backup.file_size && <span>• {formatBytes(backup.file_size)}</span>}
                      {backup.encrypted && (
                        <span className="flex items-center gap-1 text-blue-600">
                          <Lock className="h-3 w-3" /> Encrypted
                        </span>
                      )}
                      {backup.s3_uploaded && (
                        <span className="flex items-center gap-1 text-purple-600">
                          <Cloud className="h-3 w-3" /> S3
                        </span>
                      )}
                    </div>
                    {backup.error && (
                      <p className="text-sm text-red-600 mt-1">{backup.error}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (confirm('Delete this backup record?')) {
                        deleteMutation.mutate(backup.id)
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

      {/* Backup Files */}
      <div className="bg-white rounded-lg border">
        <div className="p-4 border-b">
          <h2 className="font-semibold">Backup Files on Disk</h2>
        </div>
        <div className="divide-y">
          {files?.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No backup files found</div>
          ) : (
            files?.map((file: any) => (
              <div key={file.name} className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium font-mono text-sm">{file.name}</p>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <span>{file.size_formatted}</span>
                    <span>•</span>
                    <span>{new Date(file.modified_at).toLocaleString()}</span>
                    {file.encrypted && (
                      <span className="flex items-center gap-1 text-blue-600">
                        <Lock className="h-3 w-3" /> Encrypted
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={`/api/backups/files/${file.name}/download`}
                    className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                    title="Download"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                  <button
                    onClick={() => uploadMutation.mutate(file.name)}
                    disabled={uploadMutation.isPending}
                    className="p-2 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded"
                    title="Upload to S3"
                  >
                    <Cloud className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Delete this file?')) {
                        deleteFileMutation.mutate(file.name)
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
