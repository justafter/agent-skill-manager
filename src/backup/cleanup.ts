export interface BackupRetentionPolicy {
  keepLatest: number
  keepDays: number
  maxBytes: number
}

export const defaultBackupRetentionPolicy: BackupRetentionPolicy = {
  keepLatest: 50,
  keepDays: 30,
  maxBytes: 2 * 1024 * 1024 * 1024
}
