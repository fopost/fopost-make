# FoPost

[FoPost](https://fopost.com) is a multi-platform social media management tool. Connect your
social accounts once, compose a post (or a whole thread) and let FoPost distribute it across
every network you publish to.

Use this app to schedule and publish posts from a Make scenario, react the moment a post goes
live or fails, upload media into your FoPost library, and read your cross-platform analytics.

## Get your API key

1. Sign in at [fopost.com](https://fopost.com).
2. Open **Settings → API keys** and create a key.
3. Copy the key — it is shown once — and paste it into the FoPost connection in Make.

An API key can be scoped to a single workspace. A workspace-scoped key only ever sees that
workspace: naming any other workspace returns a permission error, and list modules return only
that workspace's records.

## Notes

- **Publishing is two steps.** *Create a post* stores the post; *Publish a post* hands it to the
  delivery queue. The publish module returns as soon as delivery is **queued**, not when the post
  is live on the network — watch for the result with *Watch published posts*, *Watch failed posts*
  or *Watch events*.
- **Scheduling.** Set *Status* to `scheduled` and give a *Schedule at* date; FoPost publishes it
  for you, no further module needed.
- **Media.** A post's media must already be reachable by URL. Use *Upload media* first and map the
  returned URL into the post's content block.
- **Rate limits.** The API allows 100 requests per minute per key. The app maps a rate-limit
  response onto Make's `RateLimitError`, so the scenario is paused and resumed rather than failed.

## Links

- Documentation: https://fopost.com/docs
- Support: https://fopost.com/contact
