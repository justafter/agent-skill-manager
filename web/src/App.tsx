import { NavLink, Route, Routes } from 'react-router-dom'
import { BackupPage } from './pages/BackupPage'
import { ProjectSpacePage } from './pages/ProjectSpacePage'
import { ProjectWorkspacePage } from './pages/ProjectWorkspacePage'
import { RulesPage } from './pages/RulesPage'
import { SkillsPage } from './pages/SkillsPage'
import { SessionsPage } from './pages/SessionsPage'

export function App() {
  return (
    <main className="app-shell">
      <header className="app-header">
        <h1>Agent Skill Manager</h1>
        <nav className="app-nav">
          <NavLink to="/">Skill 列表</NavLink>
          <NavLink to="/rules">Rule 模板库</NavLink>
          <NavLink to="/projects">项目空间</NavLink>
          <NavLink to="/backups">备份管理</NavLink>
          <NavLink to="/sessions">会话管理</NavLink>
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<SkillsPage />} />
        <Route path="/rules" element={<RulesPage />} />
        <Route path="/projects" element={<ProjectSpacePage />} />
        <Route path="/projects/:id" element={<ProjectWorkspacePage />} />
        <Route path="/backups" element={<BackupPage />} />
        <Route path="/sessions" element={<SessionsPage />} />
      </Routes>
    </main>
  )
}
