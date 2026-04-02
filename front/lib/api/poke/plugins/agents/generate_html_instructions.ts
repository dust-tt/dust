import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { createPlugin } from "@app/lib/api/poke/types";
import { convertMarkdownToHtml } from "@app/lib/editor";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { Err, Ok } from "@app/types/shared/result";

export const generateHtmlInstructionsPlugin = createPlugin({
  manifest: {
    id: "generate-html-instructions",
    name: "Generate HTML Instructions",
    description:
      "Convert the agent's markdown instructions to HTML using the same TipTap pipeline as the frontend editor",
    resourceTypes: ["agents"],
    args: {},
  },
  execute: async (auth, resource, _args) => {
    if (!resource) {
      return new Err(new Error("Agent configuration not found"));
    }

    const agentConfiguration = await getAgentConfiguration(auth, {
      agentId: resource.sId,
      variant: "full",
    });

    if (!agentConfiguration) {
      return new Err(new Error("Agent configuration not found"));
    }

    const { instructions } = agentConfiguration;
    if (!instructions) {
      return new Err(new Error("Agent has no markdown instructions"));
    }

    const html = convertMarkdownToHtml(instructions);

    await AgentConfigurationModel.update(
      { instructionsHtml: html },
      { where: { sId: resource.sId } }
    );

    return new Ok({
      display: "text",
      value: `HTML instructions generated and saved (${html.length} chars). Preview:\n${html.substring(0, 500)}${html.length > 500 ? "..." : ""}`,
    });
  },
  isApplicableTo: (_auth, resource) => {
    if (!resource) {
      return false;
    }

    return resource.status === "active" && !!resource.instructions;
  },
});
