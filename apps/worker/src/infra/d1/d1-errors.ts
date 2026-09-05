export type D1RepositoryErrorCode =
  | "invalid_input"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "limit_exceeded"
  | "unavailable";

export class D1RepositoryError extends Error {
  readonly code: D1RepositoryErrorCode;

  constructor(code: D1RepositoryErrorCode, message = "D1 operation was not completed") {
    super(message);
    this.name = "D1RepositoryError";
    this.code = code;
  }
}

export function mapD1Error(error: unknown): D1RepositoryError {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("member limit")) return new D1RepositoryError("limit_exceeded");
  if (message.includes("owner") || message.includes("audit log")) {
    return new D1RepositoryError("forbidden");
  }
  if (message.includes("unique") || message.includes("constraint")) {
    return new D1RepositoryError("conflict");
  }
  return new D1RepositoryError("unavailable");
}

export function ensureRepositoryError(error: unknown): D1RepositoryError {
  return error instanceof D1RepositoryError ? error : mapD1Error(error);
}
