export const PERSONAL_INFO_TYPES = Object.freeze(["name", "kana", "phone", "email", "postal", "address"]);

const TYPE_SET = new Set(PERSONAL_INFO_TYPES);
const NAMES = ["高橋一郎", "佐藤直子", "鈴木健太", "田中美咲", "伊藤拓也"];
const KANAS = ["タカハシイチロウ", "サトウナオコ", "スズキケンタ", "タナカミサキ", "イトウタクヤ"];
const PREFECTURES = ["東京都", "大阪府", "愛知県", "福岡県", "宮城県"];

function randomIndex(size, random = globalThis.crypto) {
  if (!size) return 0;
  const bytes = new Uint32Array(1);
  try { random?.getRandomValues?.(bytes); } catch { bytes[0] = Math.floor(Math.random() * 0xffffffff); }
  return bytes[0] % size;
}

function digits(length, random = globalThis.crypto) {
  const values = [];
  const bytes = new Uint32Array(length);
  try { random?.getRandomValues?.(bytes); } catch { for (let index = 0; index < length; index += 1) bytes[index] = Math.floor(Math.random() * 0xffffffff); }
  for (const value of bytes) values.push(String(value % 10));
  return values.join("");
}

export function normalizePersonalInfoType(value) {
  return TYPE_SET.has(value) ? value : null;
}

/**
 * Returns synthetic display text only. The source value is never accepted by
 * this function and is therefore not available to the editor or its metadata.
 */
export function createPersonalInfoValue(type, person = {}, random = globalThis.crypto) {
  const normalized = normalizePersonalInfoType(type);
  if (!normalized) return null;
  if (normalized === "name") return person.name || NAMES[randomIndex(NAMES.length, random)];
  if (normalized === "kana") return person.kana || KANAS[randomIndex(KANAS.length, random)];
  if (normalized === "phone") return `0${digits(2, random)}-${digits(4, random)}-${digits(4, random)}`;
  if (normalized === "email") return `manual-${digits(8, random)}@example.invalid`;
  if (normalized === "postal") return `${digits(3, random)}-${digits(4, random)}`;
  const prefecture = PREFECTURES[randomIndex(PREFECTURES.length, random)];
  return `${prefecture}${digits(2, random)}-${digits(2, random)}-${digits(2, random)}`;
}

export function createSyntheticPerson(random = globalThis.crypto) {
  const index = randomIndex(NAMES.length, random);
  return { name: NAMES[index], kana: KANAS[index] };
}

