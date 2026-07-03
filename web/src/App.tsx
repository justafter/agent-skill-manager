import { NavLink, Route, Routes } from 'react-router-dom'
import { BackupPage } from './pages/BackupPage'
import { ImportPage } from './pages/ImportPage'
import { ProjectSpacePage } from './pages/ProjectSpacePage'
import { SkillsPage } from './pages/SkillsPage'

export function App() {
  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>Agent Skill Manager</h1>
          <p>Local skill library, target sync, project rules, and backups.</p>
        </div>
        <nav className="app-nav">
          <NavLink to="/">Skills</NavLink>
          <NavLink to="/projects">Projects</NavLink>
          <NavLink to="/import">Import</NavLink>
          <NavLink to="/backups">Backups</NavLink>
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<SkillsPage />} />
        <Route path="/projects" element={<ProjectSpacePage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/backups" element={<BackupPage />} />
      </Routes>
    </main>
  )
}
