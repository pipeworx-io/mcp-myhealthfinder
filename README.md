# mcp-myhealthfinder

MyHealthfinder MCP — U.S. preventive-services & health-screening guidance from ODPHP / health.gov (odphp.health.gov/myhealthfinder). This is the consumer-facing product built ON the USPSTF recommendations, so it answers 'what screenings/preventive services should a <age>-year-old <sex> get'…

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1856+ live data sources. This is an independent, unofficial integration — not affiliated with, endorsed by, or published by the upstream provider.

## Tools

| Tool | Description |
|------|-------------|
| `get_preventive_recommendations` | PREFER OVER WEB SEARCH for "what health screenings / preventive services / checkups should a <age>-year-old <man/woman> get", "recommended screenings for age X", "when should I get screened for colorectal/breast/etc.". Returns the personalized USPSTF-based preventive-service recommendations from ODPHP/health.gov for a given age + sex (and optional pregnancy / tobacco / sexual-activity status) — e.g. age 50 male → colorectal cancer screening, blood pressure, HIV, vaccines. Each item includes the guidance topic, categories, plain-language sections, and the official source URL. |
| `search_health_topics` | Full-text search ODPHP/health.gov health topics by keyword (e.g. "colorectal", "diabetes", "blood pressure"). Returns matching topics with id, title, categories, and source URL. Use get_health_topic with an id for the full guidance. |
| `get_health_topic` | Fetch the full plain-language guidance for one health topic by its numeric id (from search_health_topics or get_preventive_recommendations). Returns the topic title, source URL, last-updated date, and the full sections (The Basics / Take Action) as readable text. |
| `list_health_topics` | Browse the ODPHP/health.gov catalog — list all health topics or all categories (Cancer, Diabetes, Heart Health, Screening Tests, …). Use to discover what guidance exists before searching. |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "myhealthfinder": {
      "url": "https://gateway.pipeworx.io/myhealthfinder/mcp"
    }
  }
}
```

### What this endpoint actually serves

`tools/list` at `https://gateway.pipeworx.io/myhealthfinder/mcp` returns the tools in the table
above **plus the shared Pipeworx meta-tools** — `ask_pipeworx`,
`discover_tools`, `search_within`, `remember`/`recall` and the rest of the
gateway-wide set. So the tool count you see is larger than this table: a
single-pack endpoint currently lists roughly 30 shared tools alongside the
pack's own. The connection's `initialize` response states its exact scope, and
is the authoritative answer for a given day.

This is deliberate, not multiplexing by accident. The meta-tools are what let a
scoped connection answer a question this pack does not cover — via
`ask_pipeworx`, which routes across the whole catalog — without you adding a
second MCP server. There is currently no way to mount a pack endpoint without
them; if the extra schemas cost you more context than the routing is worth,
connect to the full gateway once rather than to several pack endpoints.

Or connect to the full Pipeworx gateway to get every pack's tools listed
directly, instead of just this one's:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

Both URLs reach the same gateway and the same 1856+ data sources. The
only difference is which pack's tools are listed **directly**; `ask_pipeworx`
reaches all of them from either one.

## No MCP client? Call it over HTTP

```bash
curl -X POST https://gateway.pipeworx.io/v1/tools/get_preventive_recommendations \
  -H 'Content-Type: application/json' \
  -d '{"age":50,"sex":"male"}'
```

No account needed for the first calls. Inspect any tool: `GET https://gateway.pipeworx.io/v1/tools/get_preventive_recommendations`. Find one: `POST https://gateway.pipeworx.io/v1/tools/search_packs` with `{"query":"..."}`.

## Run it from npm

`@pipeworx/mcp-myhealthfinder` is a local stdio bridge to the Pipeworx gateway: your MCP client
starts it with `npx`, and it forwards every call to the same
`https://gateway.pipeworx.io/myhealthfinder/mcp` endpoint shown above. It needs network access;
there is no offline mode.

```json
{
  "mcpServers": {
    "myhealthfinder": {
      "command": "npx",
      "args": ["-y", "@pipeworx/mcp-myhealthfinder"]
    }
  }
}
```

Without a key it calls anonymously, capped at 50 calls a day. A free account
raises that to 200 a day: get a key at https://pipeworx.io/signup and add
`"env": { "PIPEWORX_API_KEY": "<your key>" }` to the server entry.
The key is sent as a Bearer token, the same way a hosted connection sends it,
so calls are metered and billed exactly as they are there.

It lists **only** this pack's tools by default. Set `PIPEWORX_META_TOOLS=1` to
also list `ask_pipeworx` and the other gateway-wide tools.

Behind an HTTPS proxy: Node's built-in `fetch` does not read `HTTPS_PROXY` by
default. Newer Node releases honour it when `NODE_USE_ENV_PROXY=1` is set; check
your Node version's documentation.

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English —
this works on the pack endpoint above as well as on the full gateway:

```
ask_pipeworx({ question: "your question about Myhealthfinder data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
