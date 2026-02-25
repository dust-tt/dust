import { getLangfuseClient } from "@app/lib/api/langfuse_client";
import logger from "@app/logger/logger";
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

    return new Ok(prompt.compile(variables));
  } catch (error) {
    logger.error(
      { promptName, error: normalizeError(error) },
      "[Langfuse] Failed to fetch prompt"
    );
    return new Err(normalizeError(error));
  }
}
