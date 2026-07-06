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
          <p>本地 Skill 库，目标同步，项目规则与备份管理。</p>
        </div>
        <nav className="app-nav">
          <NavLink to="/">Skill 列表</NavLink>
          <NavLink to="/projects">项目空间</NavLink>
          <NavLink to="/import">导入技能</NavLink>
          <NavLink to="/backups">备份管理</NavLink>
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
