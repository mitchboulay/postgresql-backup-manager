import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { Database, Calendar, Settings, FileText, Activity, RotateCcw } from 'lucide-react'
import Dashboard from './pages/Dashboard'
import Databases from './pages/Databases'
import Schedules from './pages/Schedules'
import Backups from './pages/Backups'
import Restore from './pages/Restore'
import SettingsPage from './pages/Settings'
import Logs from './pages/Logs'

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        {/* Sidebar */}
        <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r bg-white">
          <div className="flex h-16 items-center border-b px-6">
            <h1 className="text-xl font-bold text-gray-900">Backup Manager</h1>
          </div>
          <nav className="space-y-1 p-4">
            <NavLink
              to="/"
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`
              }
            >
              <Activity className="h-5 w-5" />
              Dashboard
            </NavLink>
            <NavLink
              to="/databases"
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`
              }
            >
              <Database className="h-5 w-5" />
              Databases
            </NavLink>
            <NavLink
              to="/schedules"
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`
              }
            >
              <Calendar className="h-5 w-5" />
              Schedules
            </NavLink>
            <NavLink
              to="/backups"
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`
              }
            >
              <FileText className="h-5 w-5" />
              Backups
            </NavLink>
            <NavLink
              to="/restore"
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`
              }
            >
              <RotateCcw className="h-5 w-5" />
              Restore
            </NavLink>
            <NavLink
              to="/logs"
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`
              }
            >
              <FileText className="h-5 w-5" />
              Logs
            </NavLink>
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`
              }
            >
              <Settings className="h-5 w-5" />
              Settings
            </NavLink>
          </nav>
        </aside>

        {/* Main content */}
        <main className="ml-64 min-h-screen p-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/databases" element={<Databases />} />
            <Route path="/schedules" element={<Schedules />} />
            <Route path="/backups" element={<Backups />} />
            <Route path="/restore" element={<Restore />} />
            <Route path="/logs" element={<Logs />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
