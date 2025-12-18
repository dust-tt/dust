import { clientFetch } from "@app/lib/egress/client";
import type { PostSkillSuggestionsRequestBody } from "@app/pages/api/w/[wId]/builder/skills/suggestions";
import type { APIError, Result, WorkspaceType } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

interface SkillDescriptionSuggestionResponse {
  suggestion: string;
}

export async function getSkillDescriptionSuggestion({
  owner,
  instructions,
  agentFacingDescription,
  tools,
}: {
  owner: WorkspaceType;
  instructions: string;
  agentFacingDescription: string;
  tools: { name: string; description: string }[];
}): Promise<Result<SkillDescriptionSuggestionResponse, APIError>> {
  try {
    const res = await clientFetch(
      `/api/w/${owner.sId}/builder/skills/suggestions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instructions,
          agentFacingDescription,
          tools,
        } satisfies PostSkillSuggestionsRequestBody),
      }
    );

    if (!res.ok) {
      const errorData = await res.json();
      return new Err({
        type: "internal_server_error",
        message:
          errorData.error?.message ??
          `HTTP ${res.status}: Failed to get description suggestion`,
      });
    }

    const data = await res.json();
    return new Ok(data);
  } catch (error) {
    return new Err({
      type: "internal_server_error",
      message: normalizeError(error).message,
    });
  }
}
