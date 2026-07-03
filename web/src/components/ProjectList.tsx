export interface ProjectListProps {
  projects: { id: string; name: string; path: string }[]
}

export function ProjectList({ projects }: ProjectListProps) {
  if (projects.length === 0) {
    return <div className="empty-state">No projects registered.</div>
  }

  return (
    <table className="table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Path</th>
        </tr>
      </thead>
      <tbody>
        {projects.map((project) => (
          <tr key={project.id}>
            <td>{project.name}</td>
            <td>{project.path}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
