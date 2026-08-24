import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "pgsql-parser";

const repositoryRoot = path.resolve(new URL("..", import.meta.url).pathname);
const fixturesRoot = path.join(repositoryRoot, "tests/fixtures/ai-prohibition/parser-adoption");

const expected = new Map([
  ["001_plain.sql", { functions: ["public.ai_summarize"] }],
  ["002_or_replace.sql", { functions: ["public.ai_generate"] }],
  ["003_qualified_spaced.sql", { functions: ["public.ai_vectorize"] }],
  ["004_quoted_schema.sql", { functions: ["public.ai_vectorize"] }],
  ["005_quoted_hyphen.sql", { functions: ["tenant-prod.ai_vectorize"] }],
  ["006_quoted_space.sql", { functions: ["tenant prod.ai_vectorize"] }],
  ["007_doubled_quote.sql", { functions: ["tenant\"prod.ai_vectorize"] }],
  ["008_line_comment.sql", { functions: ["public.ai_vectorize"] }],
  ["009_block_comment.sql", { functions: ["public.ai_vectorize"] }],
  ["010_nested_comment.sql", { functions: ["public.ai_vectorize"] }],
  ["011_unterminated_comment.sql", { error: "unterminated .*comment" }],
  ["012_malformed_header.sql", { error: "unterminated quoted identifier" }],
  ["013_unknown_header.sql", { error: "syntax error" }],
  ["014_ordinary_function.sql", { functions: ["public.calculate_manual_total"] }]
]);

function extractFunctionNames(ast) {
  return ast.stmts.flatMap(({ stmt }) => {
    const functionStatement = stmt.CreateFunctionStmt;
    if (!functionStatement) return [];
    return [functionStatement.funcname.map(({ String: value }) => value.sval).join(".")];
  });
}

const fixtureFiles = (await readdir(fixturesRoot)).filter((file) => file.endsWith(".sql")).sort();
assert.deepEqual(fixtureFiles, [...expected.keys()], "fixture manifest must cover the complete differential corpus");

const durations = [];
for (const file of fixtureFiles) {
  const source = await readFile(path.join(fixturesRoot, file), "utf8");
  const expectation = expected.get(file);
  const started = performance.now();
  try {
    const names = extractFunctionNames(await parse(source));
    durations.push(performance.now() - started);
    assert.equal(expectation.error, undefined, `${file} must fail closed`);
    assert.deepEqual(names, expectation.functions, `${file} function AST mismatch`);
    if (expectation.functions.some((name) => name.split(".").at(-1).toLowerCase().startsWith("ai_"))) {
      assert.ok(names.some((name) => name.split(".").at(-1).toLowerCase().startsWith("ai_")), `${file} AI function was not extracted`);
    }
  } catch (error) {
    durations.push(performance.now() - started);
    if (!expectation.error) throw error;
    assert.match(error.message.toLowerCase(), new RegExp(expectation.error), `${file} must fail closed with the expected parser error`);
  }
}

const sortedDurations = [...durations].sort((a, b) => a - b);
const medianMs = sortedDurations[Math.floor(sortedDurations.length / 2)];
console.log(`SQL parser adoption spike OK: ${fixtureFiles.length} fixtures; median parse ${medianMs.toFixed(2)}ms; fail-closed malformed/comment cases and non-AI pass verified.`);
