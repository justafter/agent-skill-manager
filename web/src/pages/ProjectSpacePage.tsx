import { ProjectList } from '../components/ProjectList'

export function ProjectSpacePage() {
  return (
    <section className="page">
      <div className="toolbar">
        <h2>项目空间</h2>
        <button className="button" type="button">
          添加项目
        </button>
      </div>
      <ProjectList projects={[]} />
    </section>
  )
}
