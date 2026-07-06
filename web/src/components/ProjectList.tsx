export interface ProjectListProps {
  projects: { id: string; name: string; path: string }[]
}

export function ProjectList({ projects }: ProjectListProps) {
  if (projects.length === 0) {
    return <div className="empty-state">未注册任何项目。</div>
  }

  return (
    <table className="table">
      <thead>
        <tr>
          <th>项目名称</th>
          <th>项目路径</th>
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
