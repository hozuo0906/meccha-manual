import assert from "node:assert/strict";
import test from "node:test";

import { suggestManualInstruction } from "../apps/worker/src/domain/manual/instruction-template.ts";

test("click action generates the accepted Japanese template", () => {
  assert.equal(
    suggestManualInstruction({ targetText: "保存ボタン", actionType: "click" }),
    "［保存ボタン］をクリックします。"
  );
});

test("input action never receives or emits the entered value", () => {
  assert.equal(
    suggestManualInstruction({ targetText: "メールアドレス欄", actionType: "input" }),
    "［メールアドレス欄］に入力します。"
  );
});

test("supported actions stay deterministic and local", () => {
  assert.deepEqual(
    [
      ["プラン", "select"],
      ["設定ページ", "navigate"],
      ["読み込み完了", "wait"],
      ["対象項目", "other"]
    ].map(([targetText, actionType]) => suggestManualInstruction({ targetText, actionType })),
    [
      "［プラン］を選択します。",
      "［設定ページ］を開きます。",
      "［読み込み完了］を待ちます。",
      "［対象項目］を操作します。"
    ]
  );
});

test("target text is trimmed and internal whitespace is normalized", () => {
  assert.equal(
    suggestManualInstruction({ targetText: "  保存   ボタン  ", actionType: "click" }),
    "［保存 ボタン］をクリックします。"
  );
});

test("blank target does not invent an instruction", () => {
  assert.equal(suggestManualInstruction({ targetText: "   ", actionType: "click" }), null);
  assert.equal(suggestManualInstruction({ targetText: null, actionType: "click" }), null);
});

test("unknown runtime action fails closed instead of inventing text", () => {
  for (const actionType of ["unknown", "toString", "constructor", "__proto__"]) {
    assert.equal(
      suggestManualInstruction({ targetText: "対象項目", actionType }),
      null,
      actionType
    );
  }
});
