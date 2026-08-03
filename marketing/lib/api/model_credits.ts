import config from "@marketing/lib/api/config";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const modelCreditSchema = z.object({
  modelId: z.string(),
  displayName: z.string(),
  // Plain string at the wire boundary — front may introduce a new model
  // maker before this app's logo mapping is updated. Unknown makers fall
  // back to a generic rendering instead of crashing the page.
  modelMaker: z.string(),
  modelMakerDisplayName: z.string(),
  inputCreditsPerMTokens: z.number(),
  outputCreditsPerMTokens: z.number(),
});

export type PublicModelCredit = z.infer<typeof modelCreditSchema>;

const modelCreditsResponseSchema = z.object({
  models: z.array(modelCreditSchema),
});

export async function fetchPublicModelCredits(): Promise<PublicModelCredit[]> {
  const res = await fetch(
    `${config.getApiBaseUrl()}/api/marketing/model-credits`
  );

  if (!res.ok) {
    throw new Error(
      `Failed to fetch marketing model credits: ${res.status} ${res.statusText}`
    );
  }

  const parsed = modelCreditsResponseSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new Error(
      `Invalid marketing model credits response: ${fromError(parsed.error)}`
    );
  }

  return parsed.data.models;
}
