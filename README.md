# mcp-owasp

OWASP MCP — keyless.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

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

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Owasp data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
