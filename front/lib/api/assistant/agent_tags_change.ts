import { isAuthorizedForAgentSuggestionKind } from "@app/lib/api/assistant/agent_suggestion_authorization";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import type { AgentResource } from "@app/lib/resources/agent_resource";
import { TagResource } from "@app/lib/resources/tags_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { MAX_TAG_LENGTH } from "@app/types/tag";

type AgentTagsChangeError = DustError<"unauthorized" | "invalid_request_error">;

export interface AgentTagsChange {
  tagsToAdd: TagResource[];
  // Names of the added tags that do not exist in the workspace yet.
  tagNamesToCreate: string[];
  tagsToRemove: TagResource[];
  // The change as tag names: existing tags under their stored name, new ones trimmed.
  addTags: string[];
  removeTags: string[];
}

// Trims names and drops the ones repeating a previous name, case-insensitively.
function normalizeTagNames(
  names: string[]
): Result<string[], AgentTagsChangeError> {
  const byKey = new Map<string, string>();
  for (const name of names) {
    const trimmed = name.trim();
    if (!trimmed) {
      return new Err(
        new DustError("invalid_request_error", "Tag names cannot be empty.")
      );
    }
    if (trimmed.length > MAX_TAG_LENGTH) {
      return new Err(
        new DustError(
          "invalid_request_error",
          `Tag names cannot exceed ${MAX_TAG_LENGTH} characters: "${trimmed}".`
        )
      );
    }
    if (!byKey.has(trimmed.toLowerCase())) {
      byKey.set(trimmed.toLowerCase(), trimmed);
    }
  }

  return new Ok([...byKey.values()]);
}

// Resolves a name to a tag of `tags`, preferring an exact match over a case-insensitive one.
function findTagByName(
  tags: TagResource[],
  name: string
): TagResource | undefined {
  return (
    tags.find((tag) => tag.name === name) ??
    tags.find((tag) => tag.name.toLowerCase() === name.toLowerCase())
  );
}

export async function validateAgentTagsChange(
  auth: Authenticator,
  agent: AgentResource,
  { addTags, removeTags }: { addTags: string[]; removeTags: string[] }
): Promise<Result<AgentTagsChange, AgentTagsChangeError>> {
  if (!isAuthorizedForAgentSuggestionKind(auth, agent, "tags")) {
    return new Err(
      new DustError(
        "unauthorized",
        "Only editors of this agent or workspace admins can change its tags."
      )
    );
  }

  if (agent.scope === "global" || agent.status !== "active") {
    return new Err(
      new DustError(
        "invalid_request_error",
        "Only active custom agents can have their tags changed."
      )
    );
  }

  // Changing tags saves a new version, which is rebuilt from the agent's content.
  if (!agent.canViewContent) {
    return new Err(
      new DustError(
        "unauthorized",
        "You cannot change the tags of an agent whose content you cannot view."
      )
    );
  }

  const addNamesRes = normalizeTagNames(addTags);
  if (addNamesRes.isErr()) {
    return addNamesRes;
  }
  const removeNamesRes = normalizeTagNames(removeTags);
  if (removeNamesRes.isErr()) {
    return removeNamesRes;
  }
  const addNames = addNamesRes.value;
  const removeNames = removeNamesRes.value;

  if (addNames.length === 0 && removeNames.length === 0) {
    return new Err(
      new DustError(
        "invalid_request_error",
        "Provide at least one tag to add or remove."
      )
    );
  }

  const removeKeys = new Set(removeNames.map((name) => name.toLowerCase()));
  const inBothLists = addNames.filter((name) =>
    removeKeys.has(name.toLowerCase())
  );
  if (inBothLists.length > 0) {
    return new Err(
      new DustError(
        "invalid_request_error",
        `Some tags are both added and removed: ${inBothLists.join(", ")}.`
      )
    );
  }

  const [workspaceTags, currentTags] = await Promise.all([
    TagResource.findAll(auth),
    agent.listTags(auth),
  ]);
  const currentTagIds = new Set(currentTags.map((tag) => tag.sId));

  const tagsToRemove: TagResource[] = [];
  const notAgentTags: string[] = [];
  for (const name of removeNames) {
    const tag = findTagByName(currentTags, name);
    if (tag) {
      tagsToRemove.push(tag);
    } else {
      notAgentTags.push(name);
    }
  }
  if (notAgentTags.length > 0) {
    return new Err(
      new DustError(
        "invalid_request_error",
        `Some tags are not tags of the agent: ${notAgentTags.join(", ")}.`
      )
    );
  }

  const tagsToAdd: TagResource[] = [];
  const tagNamesToCreate: string[] = [];
  const alreadyAgentTags: string[] = [];
  for (const name of addNames) {
    const tag = findTagByName(workspaceTags, name);
    if (!tag) {
      tagNamesToCreate.push(name);
    } else if (currentTagIds.has(tag.sId)) {
      alreadyAgentTags.push(tag.name);
    } else {
      tagsToAdd.push(tag);
    }
  }
  if (alreadyAgentTags.length > 0) {
    return new Err(
      new DustError(
        "invalid_request_error",
        `Some tags are already tags of the agent: ${alreadyAgentTags.join(", ")}.`
      )
    );
  }

  if (tagNamesToCreate.length > 0 && !auth.isAdmin()) {
    return new Err(
      new DustError(
        "unauthorized",
        "Only workspace admins can create tags. These tags do not exist: " +
          `${tagNamesToCreate.join(", ")}.`
      )
    );
  }

  const changesProtectedTags = [...tagsToAdd, ...tagsToRemove].some(
    (tag) => tag.kind === "protected"
  );
  if (
    changesProtectedTags &&
    !auth.hasWorkspacePermission("publish", "agent")
  ) {
    return new Err(
      new DustError(
        "unauthorized",
        "Only members who can publish agents can add or remove protected tags."
      )
    );
  }

  return new Ok({
    tagsToAdd,
    tagNamesToCreate,
    tagsToRemove,
    addTags: [...tagsToAdd.map((tag) => tag.name), ...tagNamesToCreate],
    removeTags: tagsToRemove.map((tag) => tag.name),
  });
}
