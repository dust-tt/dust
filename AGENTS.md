@CODING_RULES.md

@AGENTS.local.md

# Storybook MCP (Sparkle design system)

When working on UI components, always use the `sparkle-storybook` MCP tools to access
Storybook's component and documentation knowledge before answering or taking any action.
(The server is served by the Sparkle Storybook dev server — `cd sparkle && npm run storybook`
— and registered in `.mcp.json` at the repo root.)

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

You are provided with credentials to login to the app via email & password.
They are available in the runtime secrets as DEV_WORKOS_USER_EMAIL & DEV_WORKOS_USER_PASSWORD.
Note that in the login flow, you'll have to enter the email, continue and then you'll be able to enter the password.
