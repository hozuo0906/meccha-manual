# ADR-0028: npm package-spec alias parser selection

- Status: Proposed
- Date: 2026-08-24
- Scope: Issue #130 / PR129 follow-up only

## Context

PR129 reached the standing two-cycle stop for npm alias package-spec semantics. The frozen parent head is d4c46da76dbc7f95bb9f5cc22ea8123380ebf153. The next implementation must not grow the handwritten npmAliasTargetPackage regex. This ADR records a read-only candidate spike; it does not connect a parser to the production scanner.

## Candidate comparison

| Candidate | Alias/protocol and invalid-spec semantics | Module/license evidence | Dependency and runtime impact | Decision |
|---|---|---|---|---|
| npm-package-arg 13.0.2 | npm's bundled parser recognizes lowercase, uppercase, and mixed-case npm: aliases; exposes the alias subSpec name and version/range/tag; rejects missing names and invalid scoped targets | ISC; CommonJS main (lib/npa.js) | Not a current repository dependency. A direct exact devDependency would add its four declared transitive packages to package-lock; no Worker/runtime import | Select for the next integration PR, pending exact lockfile update |
| Existing handwritten regex | Can match a few examples but does not own npm protocol normalization, optional specs, or parser error semantics | No external license/dependency | No lockfile change, but repeated bypasses already occurred | Reject |
| package-lock metadata alone | Standard v3 packageInfo.name is useful for installed target metadata but cannot parse package.json alias declarations or malformed specs | No parser dependency | No runtime impact | Use only as a separate lockfile evidence surface, not as the package-spec parser |

The spike was run against the npm-bundled npm-package-arg 13.0.2 metadata: license ISC, CommonJS main, and dependencies hosted-git-info, proc-log, semver, and validate-npm-package-name. Representative inputs produced alias subSpec names for npm:openai@4.0.0, NPM:openai@4.0.0, npm:openai, npm:@openai/core, and npm:openai@^4; npm: and npm:@openai failed closed. Values are spike evidence only and are not emitted by the scanner.

## Decision

1. Use npm-package-arg at an exact pinned version as the sole package-spec parser candidate for the next small integration PR.
2. Add it, if implementation is approved, as one direct devDependency only; update package-lock in the same PR and record the exact dependency tree. Do not add it to Worker/runtime dependencies or bundle paths.
3. Extract only structural parser fields: alias type, subSpec package name, and accepted version/tag/range; treat parser errors as prohibited for this contract.
4. Keep standard package-lock v3 packageInfo.name and root dependency declarations as separate scanner inputs; the parser does not replace either surface.
5. Replace npmAliasTargetPackage rather than extending its handwritten regex. Add case/target/spec/invalid fixtures with path-only diagnostics in the integration PR.

## Boundaries

No production runtime, Worker bundle, SQL/materialized-view handling, migrations, AI provider/runtime, deployment, preview access, credentials, secrets, real data, billing, or PC changes.