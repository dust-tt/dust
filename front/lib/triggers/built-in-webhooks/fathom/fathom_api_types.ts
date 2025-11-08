import { z } from "zod";

import type { Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

export const FathomWebhookSchema = z.object({
  id: z.string(),
  url: z.string(),
  secret: z.string(),
  created_at: z.string(),
  triggered_for: z.array(z.string()),
  include_transcript: z.boolean(),
  include_summary: z.boolean(),
  include_action_items: z.boolean(),
  include_crm_matches: z.boolean(),
});

export type FathomWebhookType = z.infer<typeof FathomWebhookSchema>;

export const FathomWebhookMetadataSchema = z.object({
  webhookId: z.string(),
  triggered_for: z.array(z.string()),
  include_transcript: z.boolean(),
  include_summary: z.boolean(),
  include_action_items: z.boolean(),
  include_crm_matches: z.boolean(),
});

export type FathomWebhookMetadata = z.infer<typeof FathomWebhookMetadataSchema>;

export type FathomAdditionalData = Record<string, never>;

export async function validateFathomApiResponse<T extends z.ZodTypeAny>(
  response: Response,
  schema: T
): Promise<Result<z.infer<T>, Error>> {
  if (!response.ok) {
    const errorText = await response.text();
    return new Err(
      new Error(`API request failed: ${response.statusText} - ${errorText}`)
    );
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (error) {
    return new Err(
      new Error(
        `Failed to parse JSON response: ${normalizeError(error).message}`
      )
    );
  }

  const parseResult = schema.safeParse(data);
  if (!parseResult.success) {
    return new Err(
      new Error(
        `API response validation failed: ${parseResult.error.message}. Response: ${JSON.stringify(data)}`
      )
    );
  }

  return new Ok(parseResult.data);
}
