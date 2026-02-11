import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import type { Authenticator } from "@app/lib/auth";
import type { TemplateResource } from "@app/lib/resources/template_resource";
import type { Result } from "@app/types";
import {
  Err,
  GEMINI_2_5_FLASH_MODEL_CONFIG,
  getSmallWhitelistedModel,
  isProviderWhitelisted,
  Ok,
  removeNulls,
} from "@app/types";

const INSTRUCTIONS = `# Goal:
Find the most relevant agent templates based on the user's description of what they want their agent to do.
Return up to 5 most relevant templates, ordered by match confidence.

# Guidelines:
- Match based on semantic similarity between the user's request and each template's description and tags.
- Prefer templates whose description closely matches the user's stated use case.

Here is the list of available templates:
`;

const FUNCTION_NAME = "suggest_templates";

const SUGGEST_TEMPLATES_FUNCTION_SPECIFICATIONS: AgentActionSpecification[] = [
  {
    name: FUNCTION_NAME,
    description:
      "Get the most relevant template ids matching the user's request.",
    inputSchema: {
      type: "object",
      properties: {
        suggested_templates: {
          type: "array",
          description: "Array of template ids.",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "The unique sId of the template.",
              },
            },
            required: ["id"],
          },
        },
      },
      required: ["suggested_templates"],
    },
  },
];

export async function getSuggestedTemplatesForQuery(
  auth: Authenticator,
  {
    query,
    templates,
  }: {
    query: string;
    templates: TemplateResource[];
  }
): Promise<Result<TemplateResource[], Error>> {
  const owner = auth.getNonNullableWorkspace();

  let model = getSmallWhitelistedModel(owner);
  if (!model) {
    return new Err(
      new Error(
        "Error suggesting templates: failed to find a whitelisted model."
      )
    );
  }

  if (isProviderWhitelisted(owner, "google_ai_studio")) {
    model = GEMINI_2_5_FLASH_MODEL_CONFIG;
  }

  const formattedTemplates = JSON.stringify(
    templates.map((t) => ({
      id: t.sId,
      handle: t.handle,
      description: t.agentFacingDescription,
      tags: t.tags,
    }))
  );

  const res = await runMultiActionsAgent(
    auth,
    {
      providerId: model.providerId,
      modelId: model.modelId,
      functionCall: FUNCTION_NAME,
      temperature: 0.7,
      useCache: true,
    },
    {
      conversation: {
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: query.trim() }],
            name: "",
          },
        ],
      },
      prompt: `${INSTRUCTIONS}${formattedTemplates}`,
      specifications: SUGGEST_TEMPLATES_FUNCTION_SPECIFICATIONS,
      forceToolCall: FUNCTION_NAME,
    },
    {
      context: {
        operationType: "copilot_template_suggestion",
        userId: auth.user()?.sId,
        workspaceId: owner.sId,
      },
    }
  );

  if (res.isErr()) {
    return new Err(
      new Error(`Error suggesting templates: ${res.error.message}`)
    );
  }

  const suggestedTemplates =
    res.value.actions?.[0]?.arguments?.suggested_templates;

  if (!suggestedTemplates || !Array.isArray(suggestedTemplates)) {
    return new Err(
      new Error(
        "No suggested_templates found in LLM response or invalid format"
      )
    );
  }

  const suggestions = removeNulls(
    suggestedTemplates.map((t: { id: string }) =>
      templates.find((t2) => t2.sId === t.id)
    )
  );

  return new Ok(suggestions);
}
