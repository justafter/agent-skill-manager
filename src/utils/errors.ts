export class AppError extends Error {
  public readonly code: string
  public readonly details?: unknown

  constructor(code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.details = details
    // Restore prototype chain
    Object.setPrototypeOf(this, new.target.prototype)
  }

  public toJSON() {
    return {
      code: this.code,
      message: this.message,
      details: this.details
    }
  }
}
