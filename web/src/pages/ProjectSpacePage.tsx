import { ProjectList } from '../components/ProjectList'

export function ProjectSpacePage() {
  return (
    <section className="page">
      <div className="toolbar">
        <h2>Projects</h2>
        <button className="button" type="button">
          Add project
        </button>
      </div>
      <ProjectList projects={[]} />
    </section>
  )
}
