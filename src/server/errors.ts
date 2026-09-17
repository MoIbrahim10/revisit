export class AppError extends Error {
  constructor(public code: string, message: string, public status = 400, public retryable = false) {
    super(message);
    this.name = "AppError";
  }
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}
