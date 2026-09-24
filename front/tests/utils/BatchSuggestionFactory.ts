import type { Authenticator } from "@app/lib/auth";
import { BatchSuggestionResource } from "@app/lib/resources/batch_suggestion_resource";
import type { ModelId } from "@app/types/shared/model_id";

export class BatchSuggestionFactory {
  static async createEmpty(
    auth: Authenticator,
    overrides: Partial<{
      title: string | null;
      analysis: string | null;
      sourceConversation: { id: ModelId; sId: string } | null;
    }> = {}
  ): Promise<BatchSuggestionResource> {
    return BatchSuggestionResource.makeNew(auth, {
      title: overrides.title ?? "Edit things",
      analysis: overrides.analysis ?? "These changes only make sense together.",
      sourceConversation: overrides.sourceConversation ?? null,
    });
  }
}
