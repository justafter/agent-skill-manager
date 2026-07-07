import { NavLink, Route, Routes } from 'react-router-dom'
import { BackupPage } from './pages/BackupPage'
import { ProjectSpacePage } from './pages/ProjectSpacePage'
import { RulesPage } from './pages/RulesPage'
import { SkillsPage } from './pages/SkillsPage'

export function App() {
  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>Agent Skill Manager</h1>
          <p>本地 Skill 库，目标同步，项目规则与备份管理。</p>
        </div>
        <nav className="app-nav">
          <NavLink to="/">Skill 列表</NavLink>
          <NavLink to="/rules">Rule 模板库</NavLink>
          <NavLink to="/projects">项目空间</NavLink>
          <NavLink to="/backups">备份管理</NavLink>
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<SkillsPage />} />
        <Route path="/rules" element={<RulesPage />} />
        <Route path="/projects" element={<ProjectSpacePage />} />
        <Route path="/backups" element={<BackupPage />} />
      </Routes>
    </main>
  )
}
