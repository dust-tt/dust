import { getLangfuseClient } from "@app/lib/api/langfuse_client";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

export async function fetchAndCompileLangfusePrompt(
  promptName: string,
  variables: Record<string, string>
): Promise<Result<string, Error>> {
  const client = getLangfuseClient();
  if (!client) {
    return new Err(new Error("Langfuse is not enabled"));
  }

  try {
    const prompt = await client.prompt.get(promptName);
    const compiledPrompt = prompt.compile(variables);

    return new Ok(compiledPrompt);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}
