# Use Precedent from an AI client (MCP)

Precedent publishes its five actions through a `rovo:mcp` module, so any MCP client that can reach the Atlassian Rovo MCP server gets them as tools.

## Connect a desktop client

1. Install the Precedent app on your Atlassian site.
2. In your MCP client's configuration (for example Claude Desktop: Settings → Developer → Edit Config), add the Atlassian remote MCP server:

```json
{
  "mcpServers": {
    "atlassian": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.atlassian.com/v1/sse"]
    }
  }
}
```

3. Restart the client and sign in to Atlassian when the browser opens. Pick the site where Precedent is installed.
4. Check the tool list for `find-precedents`, `check-conflict`, `list-open-promises`, `explain-decision` and `supersede-decision`.

## Try it

> Check Precedent before I start: can we move customer login to Firebase Auth?

Expected: a conflict with DEC-12, quoting "We decided NOT to move authentication to Firebase", owner Priya Raman, 12 Mar 2026, with the source link.

> Which promises from postmortems are still open or broken?

Add [`docs/skill.md`](skill.md) to coding agents so they check precedents before they write code.

If the tools do not appear, your organisation admin may need to allow third-party tools for the Rovo MCP server.
