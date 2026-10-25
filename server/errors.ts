export class ApiError extends Error {
  constructor(public status: number, message: string, public current?: unknown, public fields?: Record<string, string>) { super(message); }
}
