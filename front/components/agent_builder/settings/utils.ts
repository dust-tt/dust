import type {
  APIError,
  BuilderSuggestionsType,
  Result,
  WorkspaceType,
} from "@app/types";
import { Err, Ok } from "@app/types";

export async function getNameSuggestions({
  owner,
  instructions,
  description,
}: {
  owner: WorkspaceType;
  instructions: string;
  description: string;
}): Promise<Result<BuilderSuggestionsType, APIError>> {
  try {
    const res = await fetch(
      `/api/w/${owner.sId}/assistant/builder/suggestions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "name",
          inputs: { instructions, description },
        }),
      }
    );

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      return new Err({
        type: "internal_server_error",
        message:
          errorData.error?.message ||
          `HTTP ${res.status}: Failed to get name suggestions`,
      });
    }

    const data = await res.json();
    return new Ok(data);
  } catch (error) {
    return new Err({
      type: "internal_server_error",
      message:
        error instanceof Error
          ? error.message
          : "Network error while getting name suggestions",
    });
  }
}

export async function getDescriptionSuggestion({
  owner,
  instructions,
  name,
}: {
  owner: WorkspaceType;
  instructions: string;
  name: string;
}): Promise<Result<BuilderSuggestionsType, APIError>> {
  try {
    const res = await fetch(
      `/api/w/${owner.sId}/assistant/builder/suggestions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "description",
          inputs: { instructions, name },
        }),
      }
    );

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      return new Err({
        type: "internal_server_error",
        message:
          errorData.error?.message ||
          `HTTP ${res.status}: Failed to get description suggestion`,
      });
    }

    const data = await res.json();
    return new Ok(data);
  } catch (error) {
    return new Err({
      type: "internal_server_error",
      message:
        error instanceof Error
          ? error.message
          : "Network error while getting description suggestion",
    });
  }
}
