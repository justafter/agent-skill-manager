import { SkillCard } from '../components/SkillCard'

export function SkillsPage() {
  return (
    <section className="page">
      <div className="toolbar">
        <h2>Skills</h2>
        <button className="button" type="button">
          Scan
        </button>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Description</th>
            <th>Checksum</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          <SkillCard name="example-skill" description="Placeholder skill row" checksum="sha256:pending" />
        </tbody>
      </table>
    </section>
  )
}
