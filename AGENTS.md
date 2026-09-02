@CODING_RULES.md

@AGENTS.local.md

# Storybook MCP (Sparkle design system)

When working on UI components, always use the `sparkle-storybook` MCP tools to access
Storybook's component and documentation knowledge before answering or taking any action.
(The server is served by the Sparkle Storybook dev server — `cd sparkle && npm run storybook`
— and registered in `.mcp.json` at the repo root. If you use dust-hive locally, start it with
`dust-hive restart <env> storybook` instead: the hive forwarder owns port 6006 and routes it to
the forwarded env.)

- **CRITICAL: Never hallucinate component properties!** Before using ANY property on a
  component from the design system (including common-sounding ones like `shadow`, etc.), you
  MUST use the MCP tools to check if the property is actually documented for that component.
- Query `list-all-documentation` to get a list of all components.
- Query `get-documentation` for that component to see all available properties and examples.
- Only use properties that are explicitly documented or shown in example stories.
- If a property isn't documented, do not assume properties based on naming conventions or
  common patterns from other libraries. Check back with the user in these cases.
- Use the `get-storybook-story-instructions` tool to fetch the latest instructions for
  creating or updating stories. This will ensure you follow current conventions and
  recommendations.
- Check your work by running `run-story-tests`.

Remember: A story name might not reflect the property name correctly, so always verify
properties through documentation or example stories before using them.

# Cursor Cloud specific instructions

## Logging in

You are provided with credentials to login to the app via email & password.
They are available in the runtime secrets as DEV_WORKOS_USER_EMAIL & DEV_WORKOS_USER_PASSWORD.

The app entry point is `http://localhost:3011` (front-spa). Open that URL with no path.
There is no `/login` route. Unauthenticated visits to `/` call `useAuthContext`; a
`not_authenticated` response redirects the browser to
`http://localhost:3000/api/workos/login`, which then sends you to the WorkOS AuthKit
sign-in page. Enter the email, continue, then enter the password.

`front-spa` is a Vite SPA: every path returns HTTP 200 with the same HTML shell.
`curl` status codes cannot tell you whether a client route exists. `/login` falls through
to the React catch-all and renders a 404 page. Do not type `/login` in the address bar.
