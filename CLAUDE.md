# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## What This Is

The official **FoPost app for Make** (formerly Integromat). There is no compiled code and no
package registry here. A Make custom app is a set of **IML JSON** definitions that Make's own
runtime executes; this repository is the version-controlled source of truth for them, laid out
exactly the way Make's **Make Apps Editor** VS Code extension writes a cloned app to disk.

Everything is defined in terms of the raw FoPost REST API — `https://api.fopost.com/v1`,
authenticated with the `X-API-Key` header. There is no SDK dependency.

## Brand Rules

- The product is **FoPost** (`fopost.com`). Never write "OwlStack" — retired Aug 2026.
- Never write an email address. Support is https://fopost.com/contact and GitHub issues.
- Never name AI providers/models, infrastructure vendors, or any person.

## Repository Layout

The app root is `src/`. That is the directory Make's extension clones into (its default), and
every path inside `makecomapp.json` is relative to it.

```
makecomapp.json                 the manifest — the file Make right-click actions operate on
general/base.iml.json           base URL, auth header, error handling, log sanitization
general/common.json             app common data (empty; no shared secrets)
README.md                       the app documentation shown inside Make
modules/groups.json             module grouping and display order
connections/fopost/             the API key connection
modules/<kebab-name>/           one directory per module
rpcs/<kebab-name>/              one directory per remote procedure call
webhooks/fopost-events/         the dedicated webhook behind the instant trigger
```

Outside `src/`:

```
scripts/validate.mjs            offline JSON + convention checks (Node built-ins only)
scripts/deploy.mjs              non-interactive deploy via the Make CLI
examples/                       an illustrative scenario blueprint
.secrets/                       your Make API key, created by the extension, git-ignored
```

### File naming is not free-form

The extension derives every filename, and a hand-invented name will be re-created on the next
pull. The rule is `<kebab-case component id>.<code name>.<ext>`:

| Component | Codes and file names |
| --- | --- |
| module | `communication`, `static-params`, `mappable-params`, `interface`, `samples`, plus `epoch` on a polling trigger — all `.iml.json` |
| connection | `communication`, `params` (`.iml.json`), `common` (`.json`) |
| rpc | `communication`, `params` (`.iml.json`) |
| webhook | `communication`, `params`, `attach`, `detach`, `update` (`.iml.json`) |

The extension writes `.iml.json`, **not** `.imljson` — `.imljson` is the extension used by the
online editor's temporary files. `mappable-params` is the local name of the section the Make API
calls `expect`; `static-params` is the section it calls `parameters`.

Component ids must match Make's rules: modules and RPCs `^[a-zA-Z][0-9a-zA-Z]{2,63}$`,
connections and webhooks may also contain dashes. `scripts/validate.mjs` enforces both.

## Working With Make

### Pull the app down into this repository

1. Install the **Make Apps Editor** extension in VS Code and add an environment (zone URL plus a
   Make API key) under the *Make apps* activity-bar tab.
2. Open this repository as the VS Code workspace.
3. Right-click the FoPost app in the *Make apps* tree → **Clone to local workspace**, and enter
   `src` as the subdirectory. The extension writes `makecomapp.json`, every code file, and
   `.secrets/apikey`.
4. To take in changes someone made in Make's web editor afterwards: right-click
   `src/makecomapp.json` → **Pull all changes from Make**, or **Pull New Components from Make**
   for components that only exist remotely.

Cloning into an existing `src/` fails — the extension refuses when `makecomapp.json` is already
there. Clone into a scratch directory and diff, or pull instead.

### Push changes back to Make

- **From VS Code (the normal path):** right-click `src/makecomapp.json` → **Deploy to Make**.
  Right-clicking a single component directory or code file deploys only that.
- **Non-interactively:** `npm run deploy`. This drives the Make CLI (`@makehq/cli`), which
  authenticates from `MAKE_API_KEY` and `MAKE_ZONE`. The CLI has no "push this workspace"
  command — it exposes one write per section (`sdk-apps set-section`, `sdk-modules set-section`,
  and so on) — so `scripts/deploy.mjs` walks the manifest and issues those writes in dependency
  order: connection, webhook, RPCs, then modules. Use `npm run deploy:dry-run` to see the plan.

  Connections and webhooks are addressed in Make by a **remote name Make generates on creation**,
  not by the local id. Those names live in each origin's `idMapping` in `makecomapp.json`. Until
  the connection and webhook have been created once (from the extension) and pulled, the deploy
  script skips them with a warning rather than guessing a name.

### Add a new component

Right-click the component folder in VS Code → **New Local Component: Module (beta)** (or RPC,
webhook, …). The extension creates the directory, the code files, and the `makecomapp.json`
entry. Doing it by hand means writing the manifest entry yourself — `validate.mjs` will tell you
if a path is wrong or a file is orphaned.

### Getting listed publicly

A Make custom app is **private** until Make approves it. Private apps are shared with an invite
link. Getting into the public catalog means passing
[Make's partner app review](https://developers.make.com/custom-apps-documentation/app-review/overview),
which checks (among other things) that the base and connection sanitize secrets and handle
errors, that modules have correct labels and descriptions, that the app ships a universal module,
that search/trigger modules have a `limit` parameter and pagination, and that you supply test
scenarios exercising every module. **Once an app is approved, every later change also needs Make's
approval before it reaches the public version.** Do not assume a merged change is live.

## API Contract

- Base URL `https://api.fopost.com/v1`, header `X-API-Key: <key>`. Not Bearer.
- Most reads and writes answer bare JSON or `{"data": ...}`; the shapes differ per endpoint, so
  read `fopost-api-collections/openapi.json` rather than assuming. `GET /v1/posts` is
  `{data, meta}`; `POST /v1/posts` and `GET /v1/posts/{id}` return the post un-enveloped.
- Errors are `{"error": "<machine_code>", "message": "<human text>"}`. A 402 may carry
  `upgrade_url`. A 429 carries `retry_after` plus `Retry-After` and `X-RateLimit-*` headers.
- Rate limit is 100 requests per minute per key.
- `POST /v1/automations/{id}/trigger` is the one exception to the auth rule: it authenticates
  with the automation's own secret in `x-automation-secret`, not with an API key. The
  `triggerAutomation` module takes that secret as a parameter and sanitizes it from logs.

### How that maps onto the app

- `general/base.iml.json` sends the header from `{{connection.apiKey}}` and owns the whole
  `response.error` block, so no module repeats it. 402 becomes `InvalidConfigurationError` with
  the upgrade link in the message, 429 becomes `RateLimitError` so Make pauses and resumes the
  scenario instead of counting an error, 401 becomes `InvalidAccessTokenError`.
- The connection persists the key with `response.data.apiKey`, which is what makes
  `{{connection.apiKey}}` resolve in base. Removing that line silently breaks every module.
- Search and trigger modules paginate with `?page=` against `body.meta.last_page`.

## Known Limitations Worth Preserving

- **The polling triggers order by `created_at` descending**, because that is the only order
  `GET /v1/posts` supports. A post created a while ago that only becomes published now can fall
  below the trigger's watermark and be missed. `watchEvents` (the instant trigger) is the exact
  path; the polling triggers are the fallback for accounts that cannot receive a webhook. Do not
  "fix" this by switching `trigger.date` to `updated_at` — the trigger's sort field must match the
  order the API actually returns, or Make's pagination and dedup logic breaks.
- **Dependent dropdowns are flat, not nested.** `listAccounts` and `listLabels` read
  `{{parameters.workspace_id}}` directly. Make also supports `options.nested`, which re-evaluates
  the child field the moment the parent changes, but it would bury a dozen fields inside the
  workspace picker. If a user reports a stale account list, that is the tradeoff, not a bug.
- **`makeApiCall` builds its URL from `https://api.fopost.com` without the version**, so users can
  reach any API version by pasting `/v1/...`. Do not move `/v1` into the module.

## Commands

```bash
npm run validate          # JSON validity + app conventions (what CI runs)
npm run deploy:dry-run    # print the Make CLI calls a deploy would make
npm run deploy            # push every section to Make (needs MAKE_API_KEY, MAKE_ZONE)
```

`scripts/validate.mjs` is the only test harness that exists. Make's platform cannot be run
locally and Make publishes no offline validator, so the script asserts what can be asserted
without the platform: every JSON file parses; every module carries `communication`,
`mappable-params`, `interface` and `samples`; every `rpc://` reference resolves to a declared RPC;
every `codeFiles` path exists and nothing under `src/` is orphaned; component ids match Make's
naming rules; every module belongs to a group; the base URL, auth header, 402/429 error mapping
and log sanitization are intact; the connection is an `apikey`-style basic connection verified
against `GET /workspaces`; and no file contains a hard-coded API key. **Run it before every
commit.** Behaviour inside Make — IML evaluation, RPC resolution, webhook attach/detach — can
only be verified by deploying and running a scenario.

## Releasing

Tag `v<version>`; `.github/workflows/release.yml` creates the GitHub release and, when the repo
secret **`MAKE_API_TOKEN`** is set, runs `scripts/deploy.mjs` to push the definition to Make. The
zone comes from the repo variable `MAKE_ZONE` (default `EU1`). Without the secret the workflow is
release-only and says so in the log — deploy by hand from the VS Code extension.

There is no npm/registry publish. `package.json` is `private: true` and exists only to hold the
version, the repository metadata and the two scripts.

## Git

Conventional Commits, atomic. Branch `feature/<description>`, merge to `main` via PR.
Never `gh pr create` — push the branch and hand over the compare link.
