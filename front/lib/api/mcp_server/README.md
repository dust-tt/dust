# Dust MCP server

Dust exposes itself as an **MCP server** so external clients (Cursor, Claude Desktop, etc.) can call Dust over the Model Context Protocol with OAuth.

## Big picture

- **Dust** is the MCP **resource server** (tools, data).
- **WorkOS AuthKit** is the **authorization server** (OAuth, org picker, JWTs).
- Each authenticated session is scoped to a **Dust user + workspace**, derived from the WorkOS org the user picks during OAuth.

HTTP entrypoints live in `front-api/routes/mcp/`. This folder holds the auth and tool logic consumed by those routes.

## Where to start reading

| If you want to understand… | Start here |
|---|---|
| HTTP routing and wiring | `front-api/routes/mcp/` |
| OAuth metadata discovery | `front-api/routes/mcp/well-known.ts` |
| Tool definitions | `server.ts` |
| Token verification | `auth.ts` |
| User + workspace resolution from the token | `authenticator.ts` |
| How tools access per-request auth | `context.ts` |
| URLs, env vars, AuthKit domain | `urls.ts` |

## Key concepts (stable)

**Workspace = WorkOS organization.** Dust workspaces map to WorkOS orgs via `workOSOrganizationId`. Not all workspaces have one (especially free/demo). See `front/lib/api/workos/organization.ts` and the org migration in `front/migrations/20250602_migrate_organizations.ts`.

**Tools use a standard `Authenticator`.** Once auth is resolved, tool code should look like any other Dust backend code that receives an `Authenticator` — same permissions, same APIs.

**The MCP server is a singleton.** Per-request state (the `Authenticator`) is threaded separately from tool registration. See `context.ts` and the route handler in `front-api/routes/mcp/index.ts`.

## Adding a tool

Add it in `server.ts`. Use `getAuthenticatorFromMcpContext()` to access the scoped auth inside handlers. MCP clients cache tool lists — reconnect after adding or renaming tools.

## Local dev & config

Run `front-api` locally, register the MCP URL as a WorkOS Connect Resource Indicator, and point your client at `/mcp`. Config env vars are defined in `urls.ts`.

## External references

- [WorkOS AuthKit MCP](https://workos.com/docs/authkit/mcp)
- [MCP authorization](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)
