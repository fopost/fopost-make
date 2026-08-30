# Examples

## `create-and-publish-a-post.blueprint.json`

A three-module scenario that shows the shape of a FoPost flow: **Create a post** stores a draft,
**Publish a post** hands it to the delivery queue, and **Get a post** reads the per-account
delivery state back.

It matches the blueprint structure Make documents for
`GET /scenarios/{scenarioId}/blueprint` — `name`, `flow[]` (each entry with `id`, `module`,
`version`, `parameters`, `mapper`, `metadata.designer`), `metadata.scenario` and `scheduling`.

Two things have to be adjusted before it will import:

1. **The app id.** Every `module` value here reads `fopost:<moduleName>`. Make assigns a custom
   app its own id when the app is created (often with a random suffix, `fopost-a1b2c3`), so
   replace the `fopost` prefix with the id your app actually has. `make-cli sdk-apps list` shows it.
2. **The connection.** `parameters.__IMTCONN__` is `0` — a placeholder. Make rewrites it to the
   numeric id of the FoPost connection you pick after import; until then the modules open with an
   empty connection field.

The workspace, account and post ids in `mapper` are fictional. Swap in your own, or map them from
a preceding module.

This file was written by hand against the documented blueprint schema, not exported from a live
scenario. Once you have the scenario running in Make, export it (**Scenario → ⋯ → Export
Blueprint**) and commit that file instead — it is the authoritative version.
