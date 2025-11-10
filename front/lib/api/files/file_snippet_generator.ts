import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import type { Authenticator } from "@app/lib/auth";
import type { ModelIdType, ModelProviderIdType, Result } from "@app/types";
import { Err, Ok } from "@app/types";

export async function generateFileSnippet(
  auth: Authenticator,
  {
    modelId,
    providerId,
  }: { modelId: ModelIdType; providerId: ModelProviderIdType },
  inputs: { content: string }
): Promise<Result<{ snippet: string }, Error>> {
  const res = await runMultiActionsAgent(
    auth,
    {
      modelId,
      providerId,
      temperature: 1.0,
      useCache: false,
    },
    {
      conversation: {
        messages: [
          {
            role: "user",
            content: `Summarize in one ~256 characters paragraph:\n\n${inputs.content}`,
          },
        ],
      },
      prompt: "",
    }
  );

  if (res.isErr()) {
    return new Err(new Error(`Error generating snippet: ${res.error.message}`));
  }

  const snippet = res.value.generation;

  if (!snippet) {
    return new Err(new Error("No snippet generated from model"));
  }

  return new Ok({ snippet });
}
