import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const EXPECTED_SHA = "989c17f9894604dd640a1909d6e0dc550ab01c96";
const RUNBOOK = "docs/08-operations/phase2-manual-core-staging-alpha.md";
const DEFAULT_FIXTURE_DIR = "tests/fixtures/phase2-manual-core-preflight";
const EXPECTED_FIXTURES = new Map([
  ["valid-blocked.json", { identity: "valid-blocked", expectedOutcome: "BLOCKED" }],
  ["invalid-integrity-matrix.json", { identity: "invalid-integrity-matrix", expectedOutcome: "INVALID" }],
  ["invalid-value-exposure.json", { identity: "invalid-value-exposure", expectedOutcome: "INVALID" }],
  ["invalid-configuration-enum.json", { identity: "invalid-configuration-enum", expectedOutcome: "INVALID" }],
  ["invalid-blocked-flow.json", { identity: "invalid-blocked-flow", expectedOutcome: "INVALID" }],
  ["invalid-blocked-ac010.json", { identity: "invalid-blocked-ac010", expectedOutcome: "INVALID" }]
]);
const EXPECTED_FIXTURE_IDENTITIES = new Set([...EXPECTED_FIXTURES.values()].map(({ identity }) => identity));
const RESOURCES = ["manuals", "manual_revisions", "manual_steps", "step_targets"];
const ROLES = ["owner", "admin", "editor", "viewer"];
const MATRIX_PHASES = ["sameTenant", "crossTenant", "anon", "directDml", "approvedMutation", "archiveAfter"];
const MATRIX_POLICY = {
  sameTenant: "ALLOW",
  crossTenant: "DENY",
  anon: "DENY",
  directDml: "DENY",
  approvedMutation: "ROLE_SCOPED",
  archiveAfter: "DENY",
  viewerApprovedMutation: "DENY",
  stepTargetsApprovedMutation: "NOT_IMPLEMENTED"
};
const PUBLICATION_FLOW_FIELDS = {
  publish: ["status", "publishedRevisionImmutable"],
  nextDraft: ["status", "publishedRevisionUnchanged"],
  archive: ["status", "pointerRetained", "contentRetained", "auditRetained"]
};
const EVIDENCE_KEYS = new Set(["configuration", "collection", "count", "verdict", "timestamp", "candidateSha"]);
const GATE_VALUES = new Set(["PASS", "BLOCKED", "FAIL", "NOT_RUN"]);
const CELL_VERDICTS = new Set(["PASS", "NOT_RUN", "FAIL"]);
const EVIDENCE_CONFIGURATIONS = new Set(["isolated-staging", "static-repository"]);
const EVIDENCE_COLLECTIONS = new Set(["preflight-gates", "manual-core-matrix", "publication-flow", "evidence-safety"]);
const DEPLOYMENT_VERSION_RE = /^static-[0-9a-f]{16}$/;
const ALIAS_RE = /^(?:main|master|latest|head|origin\/|refs\/|branch:|tag:)/i;
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;
const SHA_RE = /^[0-9a-f]{40}$/;
const UTC_TIMESTAMP_RE = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)\.(\d{3})Z$/;

const requiredRunbookTerms = [
  "Runbook品質PASS", "internal alpha", "candidate SHA", "immutable", "artifact digest",
  "deployment version", "#92", "#94", "same-tenant", "cross-tenant", "anon",
  "direct INSERT", "approved mutation", "publish", "次draft", "pointer", "content",
  "audit", "AC-010", "公開URL", "実ID", "token", "secret", "email", "実データ",
  "Blocked", "結果不明"
];

function fail(errors, message) {
  errors.push(message);
}

function checkExactKeys(errors, object, expected, label) {
  if (!object || typeof object !== "object" || Array.isArray(object)) {
    fail(errors, `${label}: object is required`);
    return;
  }
  const actual = Object.keys(object).sort();
  const allowed = [...expected].sort();
  for (const key of actual) if (!expected.has(key)) fail(errors, `${label}: unknown field`);
  for (const key of allowed) if (!actual.includes(key)) fail(errors, `${label}: required field missing`);
}

function checkExactArray(errors, value, expected, label) {
  if (!Array.isArray(value) || value.length !== expected.length || new Set(value).size !== value.length || [...value].some((item) => !expected.includes(item))) {
    fail(errors, `${label}: fixed set is incomplete or unknown`);
  }
}

function isCanonicalUtcTimestamp(value) {
  if (typeof value !== "string" || !UTC_TIMESTAMP_RE.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function checkMatrix(errors, matrix, internalAlphaVerdict) {
  checkExactKeys(errors, matrix, new Set(["resources", "roles", "phases", "policy", "verdict"]), "matrix");
  const meta = { unimplemented: false, allPass: false };
  if (!matrix || typeof matrix !== "object") return meta;
  checkExactArray(errors, matrix.resources, RESOURCES, "matrix.resources");
  checkExactArray(errors, matrix.roles, ROLES, "matrix.roles");
  checkExactArray(errors, matrix.phases, MATRIX_PHASES, "matrix.phases");
  checkExactKeys(errors, matrix.policy, new Set(Object.keys(MATRIX_POLICY)), "matrix.policy");
  if (matrix.policy && typeof matrix.policy === "object") {
    for (const [key, expected] of Object.entries(MATRIX_POLICY)) {
      if (matrix.policy[key] !== expected) fail(errors, `matrix.policy.${key}: fixed policy mismatch`);
    }
  }
  if (!CELL_VERDICTS.has(matrix.verdict)) fail(errors, "matrix.verdict: unknown verdict");
  meta.unimplemented = matrix.policy?.stepTargetsApprovedMutation === "NOT_IMPLEMENTED";
  meta.allPass = matrix.verdict === "PASS";
  if (internalAlphaVerdict !== "PASS" && matrix.verdict !== "NOT_RUN") fail(errors, "matrix: non-alpha fixture must remain NOT_RUN");
  if (internalAlphaVerdict === "PASS" && matrix.verdict !== "PASS") fail(errors, "matrix: alpha PASS requires executed PASS verdict");
  if (internalAlphaVerdict === "PASS" && meta.unimplemented) fail(errors, "matrix: step_targets mutation is not implemented");
  return meta;
}

function checkEvidence(errors, evidence, candidateSha, representedCollectionPass, expectedCollectionCounts) {
  checkExactKeys(errors, evidence, new Set(["fields", "events"]), "evidence");
  if (!evidence || typeof evidence !== "object") return;
  const fields = evidence.fields;
  if (!Array.isArray(fields) || fields.length !== EVIDENCE_KEYS.size || new Set(fields).size !== fields.length || [...fields].some((field) => !EVIDENCE_KEYS.has(field))) {
    fail(errors, "evidence.fields: only value-free fields are allowed");
  }
  if (!Array.isArray(evidence.events) || evidence.events.length === 0) {
    fail(errors, "evidence.events: at least one event is required");
    return;
  }
  for (const event of evidence.events) {
    checkExactKeys(errors, event, EVIDENCE_KEYS, "evidence event");
    if (!event || typeof event !== "object") continue;
    if (!EVIDENCE_CONFIGURATIONS.has(event.configuration)) fail(errors, "evidence event: configuration is not an allowed enum");
    if (!EVIDENCE_COLLECTIONS.has(event.collection)) fail(errors, "evidence event: collection is not an allowed enum");
    if (event.verdict !== "PASS" && event.verdict !== "FAIL") fail(errors, "evidence event: invalid verdict");
    if (!Number.isInteger(event.count) || event.count < 0) fail(errors, "evidence event: count is not deterministic");
    if (
      Object.hasOwn(expectedCollectionCounts ?? {}, event.collection)
      && event.count !== expectedCollectionCounts[event.collection]
    ) {
      fail(errors, "evidence event: count does not match represented collection");
    }
    if (event.candidateSha !== candidateSha) fail(errors, "evidence event: candidate SHA does not match");
    if (!isCanonicalUtcTimestamp(event.timestamp)) {
      fail(errors, "evidence event: timestamp is not a canonical UTC instant");
    }
    if (event.verdict === "PASS"
      && Object.hasOwn(representedCollectionPass ?? {}, event.collection)
      && representedCollectionPass[event.collection] !== true) {
      fail(errors, "evidence event: PASS verdict is not supported by represented checks");
    }
  }
}

function checkFixture(fixture) {
  const errors = [];
  checkExactKeys(errors, fixture, new Set([
    "fixture", "expectedOutcome", "runbookQualityVerdict", "internalAlphaVerdict", "candidate",
    "artifact", "gates", "matrix", "flow", "ac010", "evidence"
  ]), "fixture");
  if (!fixture || typeof fixture !== "object") return { errors, status: "FAIL" };
  if (!EXPECTED_FIXTURE_IDENTITIES.has(fixture.fixture)) fail(errors, "fixture: unknown fixture enum");
  if (!new Set(["BLOCKED", "INVALID", "PASS"]).has(fixture.expectedOutcome)) fail(errors, "fixture: unknown expected outcome");
  if (!["PASS", "FAIL"].includes(fixture.runbookQualityVerdict)) fail(errors, "fixture: unknown runbook verdict");
  if (!["PASS", "BLOCKED", "FAIL"].includes(fixture.internalAlphaVerdict)) fail(errors, "fixture: unknown alpha verdict");

  const candidate = fixture.candidate;
  checkExactKeys(errors, candidate, new Set(["sha", "expectedSha", "refKind", "artifactDigest", "deploymentDigest", "deploymentVersion"]), "candidate");
  if (candidate && typeof candidate === "object") {
    if (!SHA_RE.test(candidate.sha ?? "") || !SHA_RE.test(candidate.expectedSha ?? "")) fail(errors, "candidate: SHA must be 40 hexadecimal characters");
    if (candidate.sha !== EXPECTED_SHA || candidate.expectedSha !== EXPECTED_SHA || candidate.sha !== candidate.expectedSha) fail(errors, "candidate: SHA does not match the expected immutable candidate");
    if (candidate.refKind !== "immutable-sha" || ALIAS_RE.test(candidate.refKind)) fail(errors, "candidate: mutable alias is not allowed");
    if (!DIGEST_RE.test(candidate.artifactDigest ?? "") || !DIGEST_RE.test(candidate.deploymentDigest ?? "")) fail(errors, "candidate: bound digest is missing or unknown");
    if (!DEPLOYMENT_VERSION_RE.test(candidate.deploymentVersion ?? "")) fail(errors, "candidate: deployment version is missing or unknown");
  }

  const artifact = fixture.artifact;
  checkExactKeys(errors, artifact, new Set(["artifactDigest", "expectedArtifactDigest", "deploymentDigest", "expectedDeploymentDigest", "deploymentVersion", "expectedDeploymentVersion", "candidateSha", "evidenceKind", "state", "result"]), "artifact");
  if (artifact && typeof artifact === "object") {
    for (const key of ["artifactDigest", "expectedArtifactDigest", "deploymentDigest", "expectedDeploymentDigest"]) {
      if (!DIGEST_RE.test(artifact[key] ?? "")) fail(errors, `artifact.${key}: immutable digest is missing or unknown`);
    }
    if (artifact.artifactDigest !== artifact.expectedArtifactDigest || artifact.deploymentDigest !== artifact.expectedDeploymentDigest) fail(errors, "artifact: digest mismatch");
    if (artifact.artifactDigest !== candidate?.artifactDigest || artifact.deploymentDigest !== candidate?.deploymentDigest || artifact.deploymentVersion !== candidate?.deploymentVersion || artifact.expectedDeploymentVersion !== candidate?.deploymentVersion || artifact.candidateSha !== candidate?.sha) fail(errors, "artifact: candidate/digest/version binding mismatch");
    if (artifact.evidenceKind !== "static-fixture") fail(errors, "artifact: evidence must be marked static-fixture");
    if (artifact.evidenceKind === "static-fixture" && fixture.internalAlphaVerdict === "PASS") fail(errors, "artifact: static fixture cannot certify live alpha PASS");
    if (!DEPLOYMENT_VERSION_RE.test(artifact.deploymentVersion ?? "") || !DEPLOYMENT_VERSION_RE.test(artifact.expectedDeploymentVersion ?? "")) fail(errors, "artifact: deployment version is missing or unknown");
    if (!SHA_RE.test(artifact.candidateSha ?? "")) fail(errors, "artifact: candidate SHA is missing or unknown");
    if (artifact.state !== "complete") fail(errors, "artifact: incomplete or stopped deployment");
    if (!new Set(["known", "unknown"]).has(artifact.result)) fail(errors, "artifact: unknown result enum");
    if (artifact.result !== "known") fail(errors, "artifact: result is unknown");
  }

  const gates = fixture.gates;
  checkExactKeys(errors, gates, new Set(["issue92", "issue94", "ownerApproval", "isolatedStaging"]), "gates");
  if (gates && typeof gates === "object") {
    if (gates.issue92 !== "PASS") {
      if (fixture.internalAlphaVerdict === "PASS") fail(errors, "gates: #92 incomplete cannot yield internal alpha PASS");
    }
    checkExactKeys(errors, gates.issue94, new Set(["db", "ci", "latestReview"]), "gates.issue94");
    if (gates.issue94 && typeof gates.issue94 === "object" && fixture.internalAlphaVerdict === "PASS" && Object.values(gates.issue94).some((value) => value !== "PASS")) {
      fail(errors, "gates: #94 DB/CI/latest review incomplete cannot yield internal alpha PASS");
    }
  }

  const matrixMeta = checkMatrix(errors, fixture.matrix, fixture.internalAlphaVerdict);
  const flow = fixture.flow;
  checkExactKeys(errors, flow, new Set(["publish", "nextDraft", "archive"]), "flow");
  if (flow && typeof flow === "object") {
    checkExactKeys(errors, flow.publish, new Set(PUBLICATION_FLOW_FIELDS.publish), "flow.publish");
    checkExactKeys(errors, flow.nextDraft, new Set(PUBLICATION_FLOW_FIELDS.nextDraft), "flow.nextDraft");
    checkExactKeys(errors, flow.archive, new Set(PUBLICATION_FLOW_FIELDS.archive), "flow.archive");
    for (const value of [flow.publish, flow.nextDraft, flow.archive]) {
      if (value && !["PASS", "NOT_RUN", "FAIL"].includes(value.status)) fail(errors, "flow: unknown status enum");
      if (value && Object.values(value).some((item) => !["PASS", "NOT_RUN", "FAIL"].includes(item))) fail(errors, "flow: unknown verdict enum");
      if (fixture.internalAlphaVerdict !== "PASS" && value && Object.values(value).some((item) => item !== "NOT_RUN")) fail(errors, "flow: non-alpha fixture must remain NOT_RUN");
      if (fixture.internalAlphaVerdict === "PASS" && value && Object.values(value).some((item) => item !== "PASS")) fail(errors, "flow: alpha PASS requires executed PASS verdicts");
    }
  }

  const ac010 = fixture.ac010;
  checkExactKeys(errors, ac010, new Set(["publishedRevisionCreated", "publicAccess", "partialEvidence"]), "ac010");
  if (ac010 && typeof ac010 === "object") {
    const expectedAc010Verdict = fixture.internalAlphaVerdict === "PASS" ? "PASS" : "NOT_RUN";
    const expectedPartialEvidence = fixture.internalAlphaVerdict === "PASS";
    if (ac010.publishedRevisionCreated !== expectedAc010Verdict || ac010.partialEvidence !== expectedPartialEvidence || ac010.publicAccess !== "NOT_RUN") {
      fail(errors, "ac010: only published-revision partial evidence is allowed");
    }
  }
  const prerequisiteValues = [
    gates?.issue92, gates?.issue94?.db, gates?.issue94?.ci, gates?.issue94?.latestReview,
    gates?.ownerApproval, gates?.isolatedStaging
  ];
  if (prerequisiteValues.some((value) => !GATE_VALUES.has(value))) fail(errors, "gates: unknown status enum");
  if (fixture.runbookQualityVerdict !== "PASS") errors.push("runbook: quality PASS is not separate and explicit");
  const prerequisitesPass = prerequisiteValues.every((value) => value === "PASS");
  const flowPass = [flow?.publish, flow?.nextDraft, flow?.archive]
    .every((value) => value && Object.values(value).every((item) => item === "PASS"));
  checkEvidence(errors, fixture.evidence, candidate?.sha, {
    "preflight-gates": prerequisitesPass,
    "manual-core-matrix": matrixMeta.allPass && !matrixMeta.unimplemented,
    "publication-flow": flowPass
  }, {
    "preflight-gates": prerequisiteValues.length,
    "manual-core-matrix": RESOURCES.length * ROLES.length * MATRIX_PHASES.length,
    "publication-flow": Object.values(PUBLICATION_FLOW_FIELDS)
      .reduce((count, fields) => count + fields.length, 0),
    "evidence-safety": EVIDENCE_KEYS.size
  });
  if (fixture.internalAlphaVerdict === "PASS" && (matrixMeta.unimplemented || !matrixMeta.allPass)) fail(errors, "matrix: alpha PASS requires implemented cells with executed PASS verdicts");
  if (!prerequisitesPass && fixture.internalAlphaVerdict === "PASS") fail(errors, "fixture: blocked preflight cannot claim internal alpha PASS");
  if (!prerequisitesPass && fixture.internalAlphaVerdict === "FAIL") fail(errors, "fixture: declared internal alpha FAIL cannot be downgraded to BLOCKED");
  if (prerequisitesPass && fixture.internalAlphaVerdict !== "PASS") fail(errors, "fixture: internal alpha PASS is missing");
  const status = errors.length > 0 ? "FAIL" : prerequisitesPass ? "PASS" : "BLOCKED";
  return { errors, status };
}

async function checkRunbook() {
  const content = await readFile(RUNBOOK, "utf8");
  return requiredRunbookTerms.filter((term) => !content.includes(term));
}

async function loadFixture(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

function checkDirectoryFixtureManifest(files, loadedFixtures) {
  const errors = [];
  const names = files.map((file) => path.basename(file));
  const nameCounts = new Map();
  for (const name of names) nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);

  const missingFiles = [...EXPECTED_FIXTURES.keys()].filter((name) => !nameCounts.has(name));
  const extraFiles = names.filter((name) => !EXPECTED_FIXTURES.has(name));
  const duplicateFiles = [...nameCounts.entries()].filter(([, count]) => count > 1).map(([name]) => name);
  if (missingFiles.length > 0) fail(errors, "fixture directory: required fixture identity is missing");
  if (extraFiles.length > 0) fail(errors, "fixture directory: unknown fixture identity is present");
  if (duplicateFiles.length > 0) fail(errors, "fixture directory: duplicate fixture identity is present");

  const identityCounts = new Map();
  for (const { file, fixture } of loadedFixtures) {
    if (!fixture || typeof fixture !== "object" || Array.isArray(fixture)) {
      fail(errors, "fixture directory: every expected identity must contain valid JSON");
      continue;
    }
    const name = path.basename(file);
    const identity = fixture.fixture;
    const expectedFixture = EXPECTED_FIXTURES.get(name);
    if (expectedFixture && identity !== expectedFixture.identity) fail(errors, "fixture directory: filename and fixture identity do not match");
    if (expectedFixture && fixture.expectedOutcome !== expectedFixture.expectedOutcome) fail(errors, "fixture directory: fixture identity and expected outcome do not match");
    if (typeof identity === "string") identityCounts.set(identity, (identityCounts.get(identity) ?? 0) + 1);
  }
  const missingIdentities = [...EXPECTED_FIXTURE_IDENTITIES].filter((identity) => !identityCounts.has(identity));
  const duplicateIdentities = [...identityCounts.entries()].filter(([, count]) => count > 1).map(([identity]) => identity);
  if (missingIdentities.length > 0) fail(errors, "fixture directory: required fixture identity is missing");
  if (duplicateIdentities.length > 0) fail(errors, "fixture directory: duplicate fixture identity is present");
  return errors;
}

async function main() {
  const args = process.argv.slice(2);
  const fixtureArg = args.find((arg) => arg.startsWith("--fixture="));
  const fixtureDir = args.find((arg) => arg.startsWith("--fixtures-dir="))?.slice("--fixtures-dir=".length) ?? DEFAULT_FIXTURE_DIR;
  const directoryMode = !fixtureArg;
  const runbookErrors = await checkRunbook().catch(() => ["runbook file is missing"]);
  const files = fixtureArg
    ? [fixtureArg.slice("--fixture=".length)]
    : (await readdir(fixtureDir)).filter((file) => file.endsWith(".json")).sort().map((file) => path.join(fixtureDir, file));
  const failures = [...runbookErrors.map(() => "runbook: required quality term missing")];
  const results = [];
  const loadedFixtures = [];
  for (const file of files) {
    const fixture = await loadFixture(file);
    loadedFixtures.push({ file, fixture });
    if (!fixture) {
      failures.push(`${file}: fixture is not valid JSON`);
      continue;
    }
    const result = checkFixture(fixture);
    results.push({ file, fixture, result });
    const expected = fixture.expectedOutcome;
    const expectationMet = expected === "BLOCKED" ? result.status === "BLOCKED" && result.errors.length === 0 : expected === "INVALID" ? result.status === "FAIL" : expected === result.status;
    if (!expectationMet) failures.push(`${file}: deterministic outcome does not match fixture expectation`);
    if (fixtureArg && result.errors.length > 0 && expected !== "INVALID") failures.push(`${file}: static preflight rejected fixture`);
  }
  if (directoryMode) failures.push(...checkDirectoryFixtureManifest(files, loadedFixtures));
  if (files.length === 0) failures.push("No static preflight fixtures found");
  if (failures.length > 0) {
    console.error(`Phase 2 manual core static preflight FAILED: ${failures.length} assertion(s)`);
    process.exit(1);
  }
  const blocked = results.filter(({ result }) => result.status === "BLOCKED").length;
  const invalid = results.filter(({ result }) => result.status === "FAIL").length;
  const passed = results.filter(({ result }) => result.status === "PASS").length;
  console.log(`Phase 2 manual core static preflight OK: ${results.length} fixture(s); runbook quality PASS; alpha PASS=${passed}, BLOCKED=${blocked}, invalid rejection=${invalid}; no live/provider/DB call.`);
}

main().catch(() => {
  console.error("Phase 2 manual core static preflight FAILED: checker error");
  process.exit(1);
});
