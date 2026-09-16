// Throwaway local test script — not part of the app, safe to delete after use.
//
// Calls suggest_agent_creation directly against your local dev DB, bypassing the
// conversation/agent-loop/Temporal/sandbox machinery entirely.
//
// Usage:
//   cd front
//   npx tsx admin/test_suggest_agent_creation.ts --workspace=<workspaceSId> --email=<youremail>
import { suggestAgentCreationHandler } from "@app/lib/api/actions/servers/building_agents_and_skills/tools/suggest_agent_creation";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { Authenticator } from "@app/lib/auth";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import parseArgs from "minimist";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const workspaceSId = args.workspace;
  const email = args.email;
  if (!workspaceSId || !email) {
    throw new Error("Usage: --workspace=<sId> --email=<email>");
  }

  const workspace = await WorkspaceResource.fetchById(workspaceSId);
  if (!workspace) {
    throw new Error(`Workspace not found: ${workspaceSId}`);
  }

  const user = await UserResource.fetchByEmail(email);
  if (!user) {
    throw new Error(`User not found: ${email}`);
  }

  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );

  const result = await suggestAgentCreationHandler(
    {
      name: "Incident Helper",
      description: "Helps triage incidents.",
      instructions: "Collect impact and timeline.",
    },
    {
      auth,
      requestId: "local-script",
      sendNotification: async () => {},
      sendRequest: async () => {
        throw new Error("Unexpected MCP request in local test script.");
      },
      signal: new AbortController().signal,
    } as never
  );

  if (result.isErr()) {
    console.error("Tool returned an error:", result.error.message);
    process.exit(1);
  }

  const output = result.value[0];
  console.log("Tool output:", output);

  if (output?.type === "text") {
    const match = /sId=(\S+) kind=create/.exec(output.text);
    if (match) {
      const suggestion = await AgentSuggestionResource.fetchById(
        auth,
        match[1]
      );
      console.log("Suggestion row:", suggestion?.toJSON());

      if (suggestion) {
        const placeholderAgent = await getAgentConfiguration(auth, {
          agentId: suggestion._agentConfigurationId,
          variant: "light",
        });
        console.log("Placeholder agent:", placeholderAgent);
        console.log(
          `Open the builder at: /w/${workspace.sId}/builder/agents/${suggestion._agentConfigurationId}`
        );
      }
    }
  }

  process.exit(0);
}

void main();
