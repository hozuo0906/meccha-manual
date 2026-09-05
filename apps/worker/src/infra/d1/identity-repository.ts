import type {
  ApplicationIdentityRecord,
  ApplicationIdentityRepository
} from "../../access-identity.ts";
import { D1RepositoryError, ensureRepositoryError } from "./d1-errors.ts";
import type { D1DatabaseLike } from "./d1-types.ts";

interface IdentityRow {
  application_id: string;
  status: "active" | "disabled";
}

export class D1IdentityRepository implements ApplicationIdentityRepository {
  private readonly db: D1DatabaseLike;

  constructor(db: D1DatabaseLike) {
    this.db = db;
  }

  async findByIssuerAndSubject(
    issuer: string,
    subject: string
  ): Promise<ApplicationIdentityRecord | null> {
    try {
      const result = await this.db
        .prepare(
          `SELECT application_id, status
             FROM identities
            WHERE issuer = ?1 AND subject = ?2
            LIMIT 1`
        )
        .bind(issuer, subject)
        .first<IdentityRow>();
      if (!result) return null;
      if (result.status !== "active" && result.status !== "disabled") {
        throw new D1RepositoryError("unavailable");
      }
      return { applicationId: result.application_id, status: result.status };
    } catch (error) {
      throw ensureRepositoryError(error);
    }
  }
}
