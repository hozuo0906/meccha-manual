from pathlib import Path


def replace_once(path_str: str, old: str, new: str) -> None:
    path = Path(path_str)
    text = path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path_str}: expected one match, found {count}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "apps/worker/src/manual-edit-router.ts",
    "const MAX_MANUAL_DETAIL_JSON_BYTES = 6 * 1024 * 1024;",
    "const MAX_MANUAL_DETAIL_JSON_BYTES = 8 * 1024 * 1024;"
)

replace_once(
    "scripts/check-phase2-manual-edit-api.mjs",
    '"MAX_MANUAL_DETAIL_JSON_BYTES = 6 * 1024 * 1024",',
    '"MAX_MANUAL_DETAIL_JSON_BYTES = 8 * 1024 * 1024",'
)

replace_once(
    "scripts/check-phase2-manual-edit-api.mjs",
    '  "6 MiB",',
    '  "8 MiB",'
)

replace_once(
    "docs/05-api/phase2-manual-edit-api.md",
    "- 詳細のSupabase JSONは、200 active stepsの最大フィールド長を安全に読める6 MiBで打ち切る。その他のSupabase JSONは512 KiBを維持する（[DEC-052](../09-delivery/decision-log.md)）。",
    "- 詳細のSupabase JSONは、200 active stepsに加えて件数異常を判定する201件目まで、DBで許容される最大フィールド長と1 code pointあたり最大6 byteのJSON制御文字escapeを安全に読める8 MiBで打ち切る。その他のSupabase JSONは512 KiBを維持する（[DEC-052](../09-delivery/decision-log.md)）。"
)

replace_once(
    "docs/09-delivery/decision-log.md",
    "| DEC-052 | 2026-08-14 | 手順書詳細は200 active steps・6 MiB、draft description 10,000文字、step title 128文字、instruction 4,000文字、target 256文字、URL 2,048文字を上限とし、manual/revision/stepのwriteはSECURITY DEFINER RPCへ集約する | 有効なデータだけで詳細APIのbuffer上限を超えるDoSと、複数tableの部分更新・Worker境界迂回を同時に防ぐため |",
    "| DEC-052 | 2026-08-14 | 手順書詳細は200 active steps・8 MiB、draft description 10,000文字、step title 128文字、instruction 4,000文字、target 256文字、URL 2,048文字を上限とし、manual/revision/stepのwriteはSECURITY DEFINER RPCへ集約する | 201件目の件数異常判定を含め、DB有効な最大長文字列がJSON制御文字escapeで1 code pointあたり最大6 byteへ展開しても詳細APIが読める一方、bufferを8 MiBで打ち切り、複数tableの部分更新・Worker境界迂回も防ぐため |"
)

marker = '''test("manual detail refuses more than 200 active steps", async () => {'''
insert = '''test("manual detail accepts 200 DB-valid rows after worst-case JSON escaping", async () => {
  const control = "\\u0001";
  const steps = Array.from({ length: 200 }, (_, position) => ({
    id: `55555555-5555-4555-8555-${String(position + 1).padStart(12, "0")}`,
    workspace_id: WORKSPACE_ID,
    revision_id: DRAFT_ID,
    position,
    type: "action",
    title: control.repeat(128),
    instruction: control.repeat(4_000),
    action_type: "navigate",
    target_text: control.repeat(256),
    url: "https://" + control.repeat(2_048 - "https://".length),
    updated_at: "2026-08-14T00:00:02.000Z"
  }));
  const encodedBytes = new TextEncoder().encode(JSON.stringify(steps)).byteLength;
  assert.ok(encodedBytes > 6 * 1024 * 1024, "fixture must reproduce the former 6 MiB regression");
  assert.ok(encodedBytes < 8 * 1024 * 1024, "DB-valid maximum rows must remain inside the bounded 8 MiB budget");

  const mock = installFetch([
    authOk(), memberOk(), editorOk(), json([manualRow()]), json([draftRow()]),
    json(steps, 200, { "content-range": "0-199/200" })
  ]);
  try {
    const response = await handleManualEditRoute(request(detailPath()), ENV);
    assert.equal(response?.status, 200);
  } finally {
    mock.restore();
  }
});

test("manual detail refuses more than 200 active steps", async () => {'''
replace_once("tests/manual-edit-api.test.mjs", marker, insert)

print("Phase 2 detail response budget fix applied.")
