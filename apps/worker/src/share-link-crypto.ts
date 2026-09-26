const HEX = "0123456789abcdef";
const BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export const SHARE_TOKEN_BYTES = 32;
export const SHARE_GRANT_BYTES = 32;
export const PASSCODE_MIN_LENGTH = 12;
export const PASSCODE_MAX_LENGTH = 128;
export const PASSCODE_MAX_BYTES = 512;
export const PBKDF2_ITERATIONS = 100_000;

function bytesToBase64Url(bytes: Uint8Array): string {
  let output = "";
  let value = 0;
  let bits = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      output += BASE64URL[(value >>> bits) & 63];
    }
  }
  if (bits > 0) output += BASE64URL[(value << (6 - bits)) & 63];
  return output;
}

function base64UrlToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error("invalid base64url");
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const character of value) {
    const digit = BASE64URL.indexOf(character);
    if (digit < 0) throw new Error("invalid base64url");
    buffer = (buffer << 6) | digit;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >>> bits) & 255);
    }
  }
  return new Uint8Array(bytes);
}

export function randomSecret(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export function validateSecret(value: unknown, byteLength: number): string {
  if (typeof value !== "string") throw new Error("secret invalid");
  if (value.length !== Math.ceil(byteLength * 8 / 6)) throw new Error("secret invalid");
  const bytes = base64UrlToBytes(value);
  if (bytes.byteLength !== byteLength || bytesToBase64Url(bytes) !== value) throw new Error("secret invalid");
  return value;
}

export function validatePasscode(value: unknown): string {
  if (typeof value !== "string") throw new Error("passcode invalid");
  const length = Array.from(value).length;
  if (length < PASSCODE_MIN_LENGTH || length > PASSCODE_MAX_LENGTH) throw new Error("passcode invalid");
  if (new TextEncoder().encode(value).byteLength > PASSCODE_MAX_BYTES || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error("passcode invalid");
  return value;
}

export async function sha256Hex(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  let output = "";
  for (const byte of digest) output += (HEX[byte >>> 4] ?? "") + (HEX[byte & 15] ?? "");
  return output;
}

export async function derivePasscodeHash(passcode: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(passcode), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: base64UrlToBytes(salt), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" }, key, 256);
  return bytesToBase64Url(new Uint8Array(bits));
}

export async function verifyPasscode(passcode: string, salt: string, expectedHash: string): Promise<boolean> {
  const actual = await derivePasscodeHash(passcode, salt);
  const left = new TextEncoder().encode(actual);
  const right = new TextEncoder().encode(expectedHash);
  if (left.byteLength !== right.byteLength) return false;
  let different = 0;
  for (let index = 0; index < left.byteLength; index += 1) different |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return different === 0;
}

export function nowIso(): string { return new Date().toISOString(); }

export function futureIso(now: string, milliseconds: number): string {
  return new Date(Date.parse(now) + milliseconds).toISOString();
}
