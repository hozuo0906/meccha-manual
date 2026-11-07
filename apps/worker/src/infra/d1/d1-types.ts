export interface D1RunResult {
  success: boolean;
  meta?: { changes?: number; last_row_id?: number };
  results?: unknown[];
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

/** Read the direct row count captured immediately after one DML statement in a D1 batch. */
export function directChanged(result: D1RunResult | undefined): number {
  const row = Array.isArray(result?.results) ? result.results[0] : undefined;
  const value = row && typeof row === "object" && "direct_changes" in row ? row.direct_changes : undefined;
  return typeof value === "number" ? value : -1;
}

export function directChangesStatement(db: D1DatabaseLike): D1BoundStatement {
  return db.prepare("SELECT changes() AS direct_changes").bind();
}
