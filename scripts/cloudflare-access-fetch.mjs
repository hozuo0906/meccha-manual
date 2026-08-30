const CLIENT_ID_ENV = "CF_ACCESS_CLIENT_ID";
const CLIENT_SECRET_ENV = "CF_ACCESS_CLIENT_SECRET";
const CLIENT_ID_HEADER = "cf-access-client-id";
const CLIENT_SECRET_HEADER = "cf-access-client-secret";

function readCredential(environment, name) {
  const value = environment?.[name];
  return typeof value === "string" && value.length > 0 ? value : "";
}

export function createCloudflareAccessHeaders(baseHeaders, environment = process.env) {
  const clientId = readCredential(environment, CLIENT_ID_ENV);
  const clientSecret = readCredential(environment, CLIENT_SECRET_ENV);

  if (Boolean(clientId) !== Boolean(clientSecret)) {
    throw new Error("Cloudflare Access service token configuration is incomplete.");
  }

  const headers = new Headers(baseHeaders);
  headers.delete(CLIENT_ID_HEADER);
  headers.delete(CLIENT_SECRET_HEADER);
  if (!clientId) return headers;

  headers.set(CLIENT_ID_HEADER, clientId);
  headers.set(CLIENT_SECRET_HEADER, clientSecret);
  return headers;
}

export async function fetchWithCloudflareAccess(input, init = {}, options = {}) {
  const {
    expectedOrigin,
    environment = process.env,
    fetchImpl = globalThis.fetch
  } = options;

  if (!expectedOrigin) {
    throw new Error("Expected application origin is required for an Access-protected request.");
  }

  let target;
  let boundary;
  try {
    target = new URL(input);
    boundary = new URL(expectedOrigin);
  } catch {
    throw new Error("Access-protected request URL configuration is invalid.");
  }

  if (target.origin !== boundary.origin) {
    throw new Error("Access credentials cannot be sent outside the configured application origin.");
  }

  if (typeof fetchImpl !== "function") {
    throw new Error("Fetch implementation is unavailable.");
  }

  const headers = createCloudflareAccessHeaders(init.headers, environment);
  if (headers.has(CLIENT_ID_HEADER) && target.protocol !== "https:") {
    throw new Error("Cloudflare Access credentials require HTTPS.");
  }

  return fetchImpl(target, {
    ...init,
    headers,
    redirect: "error"
  });
}
