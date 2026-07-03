export interface SkillCardProps {
  name: string
  description: string
  checksum: string
}

export function SkillCard({ name, description, checksum }: SkillCardProps) {
  return (
    <tr>
      <td>{name}</td>
      <td>{description}</td>
      <td>{checksum}</td>
      <td>
        <button className="button" type="button">
          Plan sync
        </button>
      </td>
    </tr>
  )
}
