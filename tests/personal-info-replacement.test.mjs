import test from "node:test";
import assert from "node:assert/strict";
import { createPersonalInfoValue, createSyntheticPerson } from "../apps/extension/editor/personal-info-replacement.js";
import { normalizeAnnotation } from "../apps/extension/editor/image-annotations.js";

const deterministicRandom = { getRandomValues(values) { values.fill(0); return values; } };

test("氏名とカナは同じ合成人物から生成される", () => {
  const person = createSyntheticPerson(deterministicRandom);
  assert.equal(createPersonalInfoValue("name", person, deterministicRandom), person.name);
  assert.equal(createPersonalInfoValue("kana", person, deterministicRandom), person.kana);
  assert.match(person.kana, /^[ァ-ヶー]+$/u);
});

test("置換値は指定種別の形式で生成され、元値を受け取らない", () => {
  const person = createSyntheticPerson(deterministicRandom);
  assert.match(createPersonalInfoValue("phone", person, deterministicRandom), /^0\d{2}-\d{4}-\d{4}$/u);
  assert.match(createPersonalInfoValue("email", person, deterministicRandom), /^manual-\d{8}@example\.invalid$/u);
  assert.match(createPersonalInfoValue("postal", person, deterministicRandom), /^\d{3}-\d{4}$/u);
  assert.equal(createPersonalInfoValue("unknown", person, deterministicRandom), null);
});

test("置換注釈は種別と合成値だけを保存できる", () => {
  const annotation = normalizeAnnotation({
    id: "replacement-1", type: "replacement", category: "kana", x: 0.1, y: 0.2, width: 0.3, height: 0.1,
    text: "タナカミサキ", color: "#111827", fontSize: 24
  });
  assert.deepEqual(annotation, {
    id: "replacement-1", type: "replacement", category: "kana", x: 0.1, y: 0.2, width: 0.3, height: 0.1,
    text: "タナカミサキ", color: "#111827", strokeWidth: 3, fontSize: 24
  });
  assert.equal(normalizeAnnotation({ ...annotation, category: "not-supported" }), null);
});

