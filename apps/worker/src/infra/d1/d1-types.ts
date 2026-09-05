export interface D1RunResult {
  success: boolean;
  meta?: { changes?: number; last_row_id?: number };
}

export interface D1Result<T> extends D1RunResult {
  results: T[];
}

export interface D1BoundStatement {
  bind(...values: unknown[]): D1BoundStatement;
  run(): Promise<D1RunResult>;
  all<T>(): Promise<D1Result<T>>;
  first<T>(): Promise<T | null>;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1BoundStatement;
}

/** Narrow D1 surface used by repositories; the Cloudflare SDK type stays in infra. */
export interface D1DatabaseLike {
  prepare(sql: string): D1PreparedStatement;
  batch(statements: D1BoundStatement[]): Promise<D1RunResult[]>;
}

export function changed(result: D1RunResult | undefined): number {
  return typeof result?.meta?.changes === "number" ? result.meta.changes : 0;
}
