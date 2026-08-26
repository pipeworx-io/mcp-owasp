# mcp-owasp

OWASP MCP — keyless.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1476+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `top10` | An OWASP Top 10 list with each category id, name, summary and the canonical URL. Lists: "web" (2021), "api" (2023), "llm" (LLM/GenAI applications 2025), "mobile" (2024). Use for awareness, mapping a finding to a category, or LLM-app threat modeling. |
| `asvs_chapters` | Table of contents for the OWASP ASVS 5.0 (Application Security Verification Standard): the 17 chapters (V1–V17) with names and requirement counts per assurance level. Use to discover which chapter to pull with asvs_requirements. |
| `asvs_requirements` | Testable security requirements from OWASP ASVS 5.0, each with its verification id (e.g. "V6.2.1"), section, level (L1/L2/L3) and text — the citable controls layer. Filter by chapter, level and/or keyword. Use to ground a control ("what does ASVS require for password storage?"). |
| `cheat_sheet` | OWASP Cheat Sheet Series — concise, practical defensive guidance. With a topic, returns the matching cheat sheet as Markdown (or candidate matches if ambiguous). Without a topic, lists all available cheat sheets. |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "owasp": {
      "url": "https://gateway.pipeworx.io/owasp/mcp"
    }
  }
}
```

### What this endpoint actually serves

`tools/list` at `https://gateway.pipeworx.io/owasp/mcp` returns the tools in the table
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

Both URLs reach the same gateway and the same 1476+ data sources. The
only difference is which pack's tools are listed **directly**; `ask_pipeworx`
reaches all of them from either one.

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English —
this works on the pack endpoint above as well as on the full gateway:

```
ask_pipeworx({ question: "your question about Owasp data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
