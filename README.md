# FoPost for Make

[![CI](https://github.com/fopost/fopost-make/actions/workflows/ci.yml/badge.svg)](https://github.com/fopost/fopost-make/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

The official [FoPost](https://fopost.com) app for [Make](https://www.make.com) (formerly
Integromat). This repository is the version-controlled source of truth for the app definition:
the IML JSON that Make executes.

FoPost is a multi-platform social media management tool. Connect your social accounts once,
compose a post or a thread, and FoPost distributes it across every network you publish to. This
app lets a Make scenario schedule and publish posts, react the moment a post goes live or fails,
upload media, and read cross-platform analytics.

## Modules

### Triggers

| Module | Type | What it does |
| --- | --- | --- |
| Watch published posts | Polling | Emits a bundle for each post that reaches the `published` status. |
| Watch failed posts | Polling | Emits a bundle for each post that failed to publish. |
| Watch events | Instant (webhook) | Fires the moment FoPost sends a subscribed event — a delivery going live, failing or being delayed, a post finishing, or an account's health changing. Registers and removes its own webhook. |

### Actions

| Module | Endpoint |
| --- | --- |
| Create a post | `POST /v1/posts` |
| Update a post | `PUT /v1/posts/{id}` |
| Get a post | `GET /v1/posts/{id}` |
| Publish a post | `POST /v1/posts/{id}/publish` |
| Cancel a post | `POST /v1/posts/{id}/cancel` |
| Duplicate a post | `POST /v1/posts/{id}/duplicate` |
| Delete a post | `DELETE /v1/posts/{id}` |
| Upload a media file | `POST /v1/media/upload` |
| Create a label | `POST /v1/labels` |
| Trigger an automation | `POST /v1/automations/{id}/trigger` |

### Searches

| Module | Endpoint |
| --- | --- |
| Search posts | `GET /v1/posts` |
| List workspaces | `GET /v1/workspaces` |
| List accounts | `GET /v1/accounts` |
| List media files | `GET /v1/media` |
| Get an analytics overview | `GET /v1/analytics/overview` |

### Universal

| Module | What it does |
| --- | --- |
| Make an API call | Performs an arbitrary authorized call against `https://api.fopost.com`, for any endpoint this app does not model. |

Workspace, account and label pickers are filled live by remote procedure calls, so you choose a
name instead of pasting a UUID.

## Install

### Private app (today)

Make custom apps are private until Make approves them for the public listing. To use this one:

1. Ask us for an invite link on the [contact page](https://fopost.com/contact), or build it
   yourself from this repository (see [CLAUDE.md](CLAUDE.md)).
2. Open the link while signed in to Make. The app appears in your organization's app list.
3. Add any FoPost module to a scenario and create a connection.

### Public listing (later)

Once the app passes [Make's partner review](https://developers.make.com/custom-apps-documentation/app-review/overview)
it appears in the public app catalog and installs like any other Make app — search for "FoPost"
in the scenario builder. Approval is Make's call, not ours, and every later change to an approved
app needs their approval too.

## Connect

The connection asks for one thing: a FoPost API key.

1. Sign in at [fopost.com](https://fopost.com).
2. Open **Settings → API keys** and create a key. It is shown once.
3. Paste it into the connection. Make verifies it immediately with a call to `GET /v1/workspaces`
   and refuses to save a key the API rejects.

A key can be scoped to a single workspace. A workspace-scoped key only ever sees that workspace:
naming another workspace returns a permission error, and list modules return only its records.

## How publishing works

Creating a post and publishing it are two steps:

1. **Create a post** stores the post as a `draft`, or as `scheduled` with a `Schedule at` date —
   in which case FoPost publishes it for you and no further module is needed.
2. **Publish a post** hands a draft to the delivery queue. It returns as soon as delivery is
   **queued**, not once the post is live on the network.

To know the outcome, use **Watch events** (instant, arrives within seconds) or the polling
**Watch published posts** / **Watch failed posts** triggers.

Media referenced by a post must already be reachable by URL — run **Upload a media file** first
and map the returned URL into the content block.

## Errors

The app maps FoPost's `{"error", "message"}` envelope onto readable Make errors and picks the
error type that makes a scenario behave sensibly:

| Status | Make error type | Effect |
| --- | --- | --- |
| 401 | `InvalidAccessTokenError` | Scenario is deactivated and you are told to reconnect. |
| 402 | `InvalidConfigurationError` | Scenario is deactivated; the message carries the upgrade link. |
| 403 | `InvalidConfigurationError` | The key lacks the scope, or the account has no subscription. |
| 404 / 422 | `DataError` | The bundle is stored as an incomplete execution if you enabled that. |
| 429 | `RateLimitError` | Make pauses the scenario and resumes it instead of counting an error. |
| 5xx | `ConnectionError` | Make backs off and retries. |

The API key is stripped from every execution log.

## Links

- Documentation: https://fopost.com/docs
- Issues: https://github.com/fopost/fopost-make/issues
- Support: https://fopost.com/contact

MIT licensed. See [LICENSE](LICENSE).
