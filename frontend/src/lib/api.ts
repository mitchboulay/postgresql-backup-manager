import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_URL || ''

export const api = axios.create({
  baseURL: `${API_BASE}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Health
export const getHealth = () => api.get('/health').then(r => r.data)
export const getHealthDetailed = () => api.get('/health/detailed').then(r => r.data)

// Databases
export const getDatabases = () => api.get('/config/databases').then(r => r.data)
export const getDatabase = (id: string) => api.get(`/config/databases/${id}`).then(r => r.data)
export const createDatabase = (data: any) => api.post('/config/databases', data).then(r => r.data)
export const updateDatabase = (id: string, data: any) => api.put(`/config/databases/${id}`, data).then(r => r.data)
export const deleteDatabase = (id: string) => api.delete(`/config/databases/${id}`).then(r => r.data)
export const testDatabase = (id: string) => api.post(`/config/databases/${id}/test`).then(r => r.data)
export const testNewDatabase = (data: any) => api.post('/config/databases/test', data).then(r => r.data)

// Backups
export const getBackups = (limit = 100) => api.get(`/backups?limit=${limit}`).then(r => r.data)
export const getBackupFiles = () => api.get('/backups/files').then(r => r.data)
export const runBackup = (dbId: string) => api.post(`/backups/run/${dbId}`).then(r => r.data)
export const runBackupSync = (dbId: string) => api.post(`/backups/run/${dbId}/sync`).then(r => r.data)
export const deleteBackup = (id: string) => api.delete(`/backups/${id}`).then(r => r.data)
export const deleteBackupFile = (filename: string) => api.delete(`/backups/files/${filename}`).then(r => r.data)
export const uploadToS3 = (filename: string) => api.post(`/backups/files/${filename}/upload-s3`).then(r => r.data)

// Schedules
export const getSchedules = () => api.get('/schedules').then(r => r.data)
export const getSchedule = (id: string) => api.get(`/schedules/${id}`).then(r => r.data)
export const createSchedule = (data: any) => api.post('/schedules', data).then(r => r.data)
export const updateSchedule = (id: string, data: any) => api.put(`/schedules/${id}`, data).then(r => r.data)
export const deleteSchedule = (id: string) => api.delete(`/schedules/${id}`).then(r => r.data)
export const runScheduleNow = (id: string) => api.post(`/schedules/${id}/run`).then(r => r.data)
export const pauseSchedule = (id: string) => api.post(`/schedules/${id}/pause`).then(r => r.data)
export const resumeSchedule = (id: string) => api.post(`/schedules/${id}/resume`).then(r => r.data)
export const getCronPresets = () => api.get('/schedules/cron/presets').then(r => r.data)
export const validateCron = (expression: string) => api.post('/schedules/cron/validate', { expression }).then(r => r.data)

// Settings
export const getSettings = () => api.get('/config/settings').then(r => r.data)
export const updateSettings = (data: any) => api.put('/config/settings', data).then(r => r.data)
export const testS3 = () => api.post('/config/settings/s3/test').then(r => r.data)
export const getS3Backups = () => api.get('/config/settings/s3/backups').then(r => r.data)
export const generateEncryptionKey = () => api.post('/config/settings/encryption/generate-key').then(r => r.data)

// Logs
export const getLogs = (limit = 200) => api.get(`/logs?limit=${limit}`).then(r => r.data)
export const clearLogs = (days = 30) => api.delete(`/logs?days=${days}`).then(r => r.data)

// Restore
export const getS3BackupsForRestore = () => api.get('/restore/s3-backups').then(r => r.data)
export const getTargetDatabases = () => api.get('/restore/databases').then(r => r.data)
export const restoreFromS3 = (data: {
  s3_key: string
  target_db: {
    host: string
    port: number
    database: string
    username: string
    password: string
    ssl_mode?: string
  }
  is_encrypted: boolean
}) => api.post('/restore/from-s3', data).then(r => r.data)
export const getRestoreStatus = (jobId: string) => api.get(`/restore/status/${jobId}`).then(r => r.data)

// Email
export const testEmail = () => api.post('/config/settings/email/test').then(r => r.data)
