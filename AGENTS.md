# Guide for coding agents

## What this repository is

This repository publishes `@hackclub/ari`, the server-side JavaScript and TypeScript package for
Ari.

Keep its public job small and clear:

- send projects to Ari;
- withdraw projects whose review is still open;
- check project status; and
- receive project and review updates from Ari.

The package should be easy to install, safe with secrets, and accurate to Ari’s public behavior. It
should not need any production dependencies.

## Check Ari before changing behavior

Do not guess how an Ari request, response, or webhook works. Read the matching files in the two Ari
repositories next to this one:

- `../ari/src/routes/docs/webhooks/+page.svelte` explains the public integration.
- `../ari-webhooks/internal/httpapi/server.go` lists the public routes.
- `../ari-webhooks/internal/httpapi/ingest.go` reads request headers and query values.
- `../ari-webhooks/internal/ingest/process.go` defines results, errors, duplicate handling,
  withdrawal, and status values.
- `../ari-webhooks/internal/ingest/validate.go` defines accepted fields and input rules.
- `../ari-webhooks/internal/signature/signature.go` defines request signing and header names.
- `../ari/src/lib/server/outbound.ts` creates review and project-update events.
- `../ari-webhooks/internal/outbound/dispatch.go` creates automatic review and fraud events.
- `../ari-webhooks/internal/outbound/sender.go` sends webhooks and decides whether a delivery
  succeeded.
- `../ari-webhooks/testdata/signatures.json` is the shared signing test used across languages.

The Ari docs show what programs are meant to use. The server code shows what is running. If they
disagree, do not choose silently. Call out the difference and wait for the intended behavior to be
confirmed before publishing a change.

Do not edit either Ari repository unless the task clearly asks for it.

## Protect what users already depend on

- Treat everything exported from `src/index.ts` as public. The same is true for package import
  paths, error classes, options, method inputs, event names, and documented defaults.
- Keep Ari request and response field names in `snake_case`. Use `camelCase` only for settings that
  belong to this SDK, such as `programId`.
- Prefer adding behavior without removing old behavior. Renaming or removing a public value,
  accepting fewer inputs, or changing a default can require a major version.
- Do not add a production dependency unless it is needed for correct behavior in every supported
  server.
- Keep the SDK server-only. Never add a browser entry that could encourage users to expose Ari
  secrets.
- Return new webhook event names through the `unknown` event. Older SDK versions must still be able
  to accept them.
- `create` and `status` may try again after temporary failures. `withdraw` must not try again
  automatically because the first request may already have worked.
- Turn a create input into JSON once and reuse that exact string on every try.
- Check webhooks with the exact body Ari sent. Never check JSON that was parsed and turned back into
  a string.
- Use Web Crypto to check signatures and credentials. Do not compare secret values with normal
  string comparisons.

## Source style

- Use strict TypeScript and standard web APIs such as `fetch`, `Request`, `Response`, and Web
  Crypto.
- Do not add comments inside `src/`. Use clear names and small functions. Put public explanations in
  `README.md` or `docs/`.
- Do not document Ari’s private architecture, jobs, database, or internal routes here.
- Group imports in this order: packages or platform modules, local values, then type-only imports.
  Put a blank line between groups.
- Use tabs, single quotes, no trailing commas, and a 100-column print width.
- Do not use default exports.
- Error messages must not include secrets, full authorization headers, or signed request bodies.
- Do not log from the SDK. The program using it decides what to log.

## When Ari changes

When Ari changes a field, response, event, header, or input rule:

1. Read the matching Ari docs and server files listed above.
2. Update the public types in `src/types.ts`.
3. Update local input checks only when the SDK can match the server reliably. Ari remains the final
   source of truth.
4. Update request or webhook behavior without exposing secrets or changing a webhook body before
   it is checked.
5. Add or update a focused test for the change.
6. Update the README, matching guide, examples, and release notes when needed.
7. Decide whether the next release is a patch, minor, or major version.
8. Run every check and inspect the files that would be published.

If signing changes, update the shared test in the Ari service first. Then copy that confirmed public
test into this SDK. Do not use one new helper to create both the code and its only expected result.

## Commands

Use Bun and the committed `bun.lock`:

```sh
bun install --frozen-lockfile
bun run format:check
bun run typecheck
bun test
bun run build
bun run pack:check
```

`bun run check` runs formatting, type checks, tests, the build, and the package smoke test. Also run
`bun run test:coverage` when changing input checks, retries, errors, or webhook checks.

Do not edit `dist/` or `dist-cjs/`; they are generated and ignored. Never say a check passed unless
you ran it and saw it pass.

## What tests should cover

- Client tests should check the request address, authentication, exact JSON body, and returned
  result or error.
- Signing tests must keep the shared Unicode example from the Ari service.
- Webhook tests should cover changed body bytes, missing headers, old timestamps, unknown events,
  and handler responses.
- Input tests should focus on messages that help users fix mistakes. They do not need to copy every
  server-side check.
- Tests must never call the live Ari service or use real secrets.
- Files in `examples/` are checked by TypeScript and must stay ready to copy.

## Before a release

- Write release notes for user-visible changes.
- Before version 1.0, use patch versions for compatible fixes and minor versions for changes that
  require users to update code.
- After version 1.0, use patch for fixes, minor for compatible features, and major for breaking
  changes.
- Run `bun run check` and `bun run pack:check` with only the intended changes present.
- Install the packed package in an empty project. Test both `import` and `require()`, plus TypeScript
  types.
- Publish from the protected release process with npm’s record of where the package came from.
- Never publish from a machine with unrelated npm scripts or unreviewed generated files.

## Done means

The public behavior matches Ari, secrets stay on the server, webhook bodies are checked safely,
known and unknown events work, docs match the types, every check passes, and the package contains
only the files meant for users.
