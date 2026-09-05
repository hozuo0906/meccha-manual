import {
  createRemoteJWKSet,
  customFetch,
  jwtVerify,
  type JWTPayload,
  type FetchImplementation
} from "jose";
import {
  inspectAccessConfig,
  type AccessBindings,
  type AccessConfig
} from "./server-config.ts";

const ACCESS_ASSERTION_HEADER = "Cf-Access-Jwt-Assertion";
const MACHINE_HEALTH_PATH = "/health/config";

export type AccessActor = AccessUserActor | ServiceTokenActor;

export interface AccessUserActor {
  kind: "access_user";
  issuer: string;
  subject: string;
}

export interface ServiceTokenActor {
  kind: "service_token";
  issuer: string;
  commonName: string;
}

export interface ApplicationIdentity {
  applicationId: string;
  issuer: string;
  subject: string;
}

export interface ApplicationIdentityRecord {
  applicationId: string;
  status: "active" | "disabled";
}

export interface ApplicationIdentityRepository {
  findByIssuerAndSubject(
    issuer: string,
    subject: string
  ): Promise<ApplicationIdentityRecord | null>;
}

export type IdentityResolution =
  | { state: "active"; identity: ApplicationIdentity }
  | { state: "disabled" }
  | { state: "unknown" }
  | { state: "unavailable" };

export type ApplicationAuthContext =
  | { kind: "application_user"; actor: AccessUserActor; identity: ApplicationIdentity }
  | { kind: "machine"; actor: ServiceTokenActor };

export interface AccessAuthenticator {
  verify(request: Request): Promise<AccessActor>;
  authenticate(request: Request, repository: ApplicationIdentityRepository): Promise<ApplicationAuthContext>;
}

export class AccessIdentityError extends Error {
  readonly status: 401 | 403 | 503;
  readonly code: "ACCESS_JWT_REQUIRED" | "ACCESS_JWT_INVALID" | "ACCESS_CONFIG_UNAVAILABLE" | "ACCESS_JWKS_UNAVAILABLE" | "ACCESS_IDENTITY_UNAVAILABLE" | "ACCESS_ACTOR_FORBIDDEN";

  constructor(
    status: 401 | 403 | 503,
    code: AccessIdentityError["code"],
    message: string
  ) {
    super(message);
    this.name = "AccessIdentityError";
    this.status = status;
    this.code = code;
  }
}

interface AccessClaims extends JWTPayload {
  type?: unknown;
  common_name?: unknown;
}

class AccessJwksUnavailable extends Error {
  constructor() {
    super("Access JWKS is unavailable");
    this.name = "AccessJwksUnavailable";
  }
}

function assertionFromRequest(request: Request): string {
  const assertion = request.headers.get(ACCESS_ASSERTION_HEADER)?.trim() ?? "";
  if (!assertion) {
    throw new AccessIdentityError(401, "ACCESS_JWT_REQUIRED", "認証情報を確認できませんでした。");
  }
  return assertion;
}

function configOrThrow(env: AccessBindings): AccessConfig {
  const config = inspectAccessConfig(env).config;
  if (!config) {
    throw new AccessIdentityError(503, "ACCESS_CONFIG_UNAVAILABLE", "認証サービスを利用できません。時間をおいて、もう一度お試しください。");
  }
  return config;
}

const fetchJwks: FetchImplementation = async (url, options) => {
  let response: Response;
  try {
    response = await fetch(url, options);
  } catch {
    throw new AccessJwksUnavailable();
  }
  if (response.status !== 200) {
    throw new AccessJwksUnavailable();
  }
  return response;
};

function joseCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  const code = error.code;
  return typeof code === "string" ? code : null;
}

function isJwksUnavailable(error: unknown): boolean {
  if (error instanceof AccessJwksUnavailable) return true;
  const code = joseCode(error);
  return code === "ERR_JOSE_GENERIC" || code === "ERR_JWKS_INVALID" || code === "ERR_JWKS_TIMEOUT" || code === "ERR_JWK_INVALID" || code === "ERR_JWKS_MULTIPLE_MATCHING_KEYS";
}

function invalidJwt(): AccessIdentityError {
  return new AccessIdentityError(401, "ACCESS_JWT_INVALID", "認証情報を確認できませんでした。");
}

function forbiddenActor(): AccessIdentityError {
  return new AccessIdentityError(403, "ACCESS_ACTOR_FORBIDDEN", "この操作を行う権限がありません。");
}

function actorFromClaims(payload: AccessClaims, config: AccessConfig, nowSeconds: number): AccessActor {
  if (typeof payload.iss !== "string" || payload.iss !== config.issuer) {
    throw invalidJwt();
  }
  if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp) || typeof payload.iat !== "number" || !Number.isFinite(payload.iat) || payload.iat > nowSeconds) {
    throw invalidJwt();
  }
  if (Object.hasOwn(payload, "nbf") && (typeof payload.nbf !== "number" || !Number.isFinite(payload.nbf) || payload.nbf > nowSeconds)) {
    throw invalidJwt();
  }

  if (payload.type !== "app") throw forbiddenActor();
  const hasSub = Object.hasOwn(payload, "sub");
  const hasCommonName = Object.hasOwn(payload, "common_name");
  if (!hasSub || typeof payload.sub !== "string") throw forbiddenActor();

  if (!hasCommonName && payload.sub.trim().length > 0) {
    return { kind: "access_user", issuer: payload.iss, subject: payload.sub };
  }

  if (hasCommonName && payload.sub === "" && typeof payload.common_name === "string" && payload.common_name.trim().length > 0) {
    return { kind: "service_token", issuer: payload.iss, commonName: payload.common_name };
  }

  throw forbiddenActor();
}

async function verifyAccessJwtWith(request: Request, config: AccessConfig, jwks: ReturnType<typeof createRemoteJWKSet>): Promise<AccessActor> {
  const assertion = assertionFromRequest(request);

  let payload: AccessClaims;
  try {
    ({ payload } = await jwtVerify<AccessClaims>(assertion, jwks, {
      algorithms: ["RS256"],
      issuer: config.issuer,
      audience: config.audience,
      requiredClaims: ["iss", "aud", "exp", "iat"]
    }));
  } catch (error) {
    if (isJwksUnavailable(error)) {
      throw new AccessIdentityError(503, "ACCESS_JWKS_UNAVAILABLE", "認証サービスを利用できません。時間をおいて、もう一度お試しください。");
    }
    throw invalidJwt();
  }

  return actorFromClaims(payload, config, Math.floor(Date.now() / 1_000));
}

export function createAccessAuthenticator(env: AccessBindings): AccessAuthenticator {
  const config = configOrThrow(env);
  const jwks = createRemoteJWKSet(new URL(config.jwksUrl), {
    timeoutDuration: 5_000,
    [customFetch]: fetchJwks
  });

  return {
    verify(request) {
      return verifyAccessJwtWith(request, config, jwks);
    },
    async authenticate(request, repository) {
      const actor = await verifyAccessJwtWith(request, config, jwks);
      const path = new URL(request.url).pathname;
      if (path === MACHINE_HEALTH_PATH) {
        requireMachineRoute(actor, request);
        if (actor.kind !== "service_token") throw forbiddenActor();
        return { kind: "machine", actor };
      }

      const user = requireHumanActor(actor);
      const resolution = await resolveApplicationIdentity(user, repository);
      if (resolution.state === "unavailable") {
        throw new AccessIdentityError(503, "ACCESS_IDENTITY_UNAVAILABLE", "認証サービスを利用できません。時間をおいて、もう一度お試しください。");
      }
      if (resolution.state !== "active") {
        throw new AccessIdentityError(403, "ACCESS_ACTOR_FORBIDDEN", "この操作を行う権限がありません。");
      }
      return { kind: "application_user", actor: user, identity: resolution.identity };
    }
  };
}

export async function verifyAccessJwt(request: Request, env: AccessBindings): Promise<AccessActor> {
  return createAccessAuthenticator(env).verify(request);
}

export async function authenticateApplicationRequest(
  request: Request,
  env: AccessBindings,
  repository: ApplicationIdentityRepository
): Promise<ApplicationAuthContext> {
  return createAccessAuthenticator(env).authenticate(request, repository);
}

export function isMachineRouteAllowed(actor: AccessActor, request: Request): boolean {
  const url = new URL(request.url);
  return actor.kind === "service_token" && request.method === "GET" && url.pathname === MACHINE_HEALTH_PATH && url.search === "" && url.hash === "";
}

export function requireHumanActor(actor: AccessActor): AccessUserActor {
  if (actor.kind !== "access_user") {
    throw forbiddenActor();
  }
  return actor;
}

export function requireMachineRoute(actor: AccessActor, request: Request): void {
  if (!isMachineRouteAllowed(actor, request)) {
    throw forbiddenActor();
  }
}

export async function resolveApplicationIdentity(
  actor: AccessActor,
  repository: ApplicationIdentityRepository
): Promise<IdentityResolution> {
  if (actor.kind !== "access_user") return { state: "unknown" };

  let record: ApplicationIdentityRecord | null;
  try {
    record = await repository.findByIssuerAndSubject(actor.issuer, actor.subject);
  } catch {
    return { state: "unavailable" };
  }
  if (!record) return { state: "unknown" };
  if (record.status === "disabled") return { state: "disabled" };
  if (record.status !== "active" || typeof record.applicationId !== "string" || record.applicationId.trim().length === 0) {
    return { state: "unavailable" };
  }
  return {
    state: "active",
    identity: { applicationId: record.applicationId, issuer: actor.issuer, subject: actor.subject }
  };
}
