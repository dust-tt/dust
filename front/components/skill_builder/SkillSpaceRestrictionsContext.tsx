import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import { getSpaceIdToActionsMap } from "@app/components/shared/getSpaceIdToActionsMap";
import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import type {
  AttachedKnowledgeFormData,
  ReferencedSkillFormData,
  SkillBuilderFormData,
} from "@app/components/skill_builder/SkillBuilderFormContext";
import {
  useSpaceProjectsLookup,
  useSpacesAccessCheck,
} from "@app/lib/swr/spaces";
import type { EnrichedSpaceType, SpaceType } from "@app/types/space";
import type { ReactNode } from "react";
import { createContext, useContext, useMemo } from "react";
import { useWatch } from "react-hook-form";

/** An editor of the skill, with the restricted spaces they cannot read. */
export interface EditorWithoutSpaceAccess {
  editor: SkillBuilderFormData["editors"][number];
  missingSpaces: SpaceType[];
}

export interface SkillSpaceRestrictionsContextType {
  actionsBySpaceId: ReturnType<typeof getSpaceIdToActionsMap>;
  allSpaces: EnrichedSpaceType[];
  areSpaceRequirementsReady: boolean;
  editorsWithoutSpaceAccess: EditorWithoutSpaceAccess[];
  globalSpace: EnrichedSpaceType | undefined;
  initialRequestedSpaceIds?: string[];
  knowledgeBySpaceId: Record<string, AttachedKnowledgeFormData[]>;
  missingSpaceIds: string[];
  nonGlobalSpacesUsedBySkill: EnrichedSpaceType[];
  nonGlobalSpacesWithRestrictions: EnrichedSpaceType[];
  skillsBySpaceId: Record<string, ReferencedSkillFormData[]>;
  spaceIdsUsedBySkill: Set<string>;
}

const SkillSpaceRestrictionsContext =
  createContext<SkillSpaceRestrictionsContextType | null>(null);

interface SkillSpaceRestrictionsProviderProps {
  children: ReactNode;
  initialRequestedSpaceIds?: string[];
}

export function SkillSpaceRestrictionsProvider({
  children,
  initialRequestedSpaceIds,
}: SkillSpaceRestrictionsProviderProps) {
  const tools = useWatch<SkillBuilderFormData, "tools">({ name: "tools" });
  const attachedKnowledge = useWatch<SkillBuilderFormData, "attachedKnowledge">(
    {
      name: "attachedKnowledge",
    }
  );
  const referencedSkills = useWatch<SkillBuilderFormData, "referencedSkills">({
    name: "referencedSkills",
  });
  const additionalSpaces = useWatch<SkillBuilderFormData, "additionalSpaces">({
    name: "additionalSpaces",
  });
  const editors = useWatch<SkillBuilderFormData, "editors">({
    name: "editors",
  });

  const { mcpServerViews, isMCPServerViewsLoading } =
    useMCPServerViewsContext();
  const { spaces, owner, isSpacesLoading } = useSpacesContext();

  const missingSpaceIds = useMemo(() => {
    if (isSpacesLoading || !initialRequestedSpaceIds?.length) {
      return [];
    }

    const existingSpaceIds = new Set(spaces.map((space) => space.sId));
    return initialRequestedSpaceIds.filter((id) => !existingSpaceIds.has(id));
  }, [isSpacesLoading, initialRequestedSpaceIds, spaces]);

  const { spaces: missingSpaces } = useSpaceProjectsLookup({
    workspaceId: owner.sId,
    spaceIds: missingSpaceIds,
  });

  const allSpaces = useMemo(() => {
    return [...spaces, ...missingSpaces];
  }, [spaces, missingSpaces]);

  const actionsBySpaceId = useMemo(() => {
    return getSpaceIdToActionsMap(tools ?? [], mcpServerViews);
  }, [tools, mcpServerViews]);

  const spaceIdsFromKnowledge = useMemo(() => {
    return new Set(attachedKnowledge?.map((k) => k.spaceId) ?? []);
  }, [attachedKnowledge]);

  const spaceIdsFromNestedSkills = useMemo(() => {
    return new Set(
      (referencedSkills ?? []).flatMap((skill) => skill.requestedSpaceIds)
    );
  }, [referencedSkills]);

  const spaceIdsUsedBySkill = useMemo(() => {
    const actionRequestedSpaceIds = Object.keys(actionsBySpaceId).filter(
      (spaceId) => actionsBySpaceId[spaceId]?.length > 0
    );

    return new Set([
      ...actionRequestedSpaceIds,
      ...spaceIdsFromKnowledge,
      ...spaceIdsFromNestedSkills,
    ]);
  }, [actionsBySpaceId, spaceIdsFromKnowledge, spaceIdsFromNestedSkills]);

  const areSpaceRequirementsReady =
    !isMCPServerViewsLoading &&
    (!initialRequestedSpaceIds ||
      (attachedKnowledge !== undefined && referencedSkills !== undefined));

  const knowledgeBySpaceId = useMemo(() => {
    const knowledgeBySpace: Record<string, AttachedKnowledgeFormData[]> = {};

    for (const knowledge of attachedKnowledge ?? []) {
      knowledgeBySpace[knowledge.spaceId] = (
        knowledgeBySpace[knowledge.spaceId] ?? []
      ).concat(knowledge);
    }

    return knowledgeBySpace;
  }, [attachedKnowledge]);

  const skillsBySpaceId = useMemo(() => {
    const skillsBySpace: Record<string, ReferencedSkillFormData[]> = {};

    for (const skill of referencedSkills ?? []) {
      for (const spaceId of skill.requestedSpaceIds) {
        skillsBySpace[spaceId] = (skillsBySpace[spaceId] ?? []).concat(skill);
      }
    }

    return skillsBySpace;
  }, [referencedSkills]);

  const additionalSpaceIds = useMemo(() => {
    return new Set(additionalSpaces ?? []);
  }, [additionalSpaces]);

  const nonGlobalSpacesUsedBySkill = useMemo(() => {
    return allSpaces.filter(
      (space) =>
        space.kind !== "global" &&
        (spaceIdsUsedBySkill.has(space.sId) ||
          additionalSpaceIds.has(space.sId))
    );
  }, [additionalSpaceIds, allSpaces, spaceIdsUsedBySkill]);

  const nonGlobalSpacesWithRestrictions = useMemo(() => {
    return nonGlobalSpacesUsedBySkill.filter((space) => space.isRestricted);
  }, [nonGlobalSpacesUsedBySkill]);

  const globalSpace = useMemo(() => {
    return allSpaces.find((s) => s.kind === "global");
  }, [allSpaces]);

  // `allSpaces` only holds spaces the current user can read, so the access check
  // never gets asked about a space it would reject.
  const restrictedSpaceIds = useMemo(() => {
    return nonGlobalSpacesWithRestrictions.map((space) => space.sId);
  }, [nonGlobalSpacesWithRestrictions]);

  const editorIds = useMemo(() => {
    return (editors ?? []).map((editor) => editor.sId);
  }, [editors]);

  const { spacesAccess } = useSpacesAccessCheck({
    workspaceId: owner.sId,
    spaceIds: restrictedSpaceIds,
    userIds: editorIds,
  });

  const editorsWithoutSpaceAccess: EditorWithoutSpaceAccess[] = useMemo(() => {
    const spaceById = new Map(
      nonGlobalSpacesWithRestrictions.map((space) => [space.sId, space])
    );
    const missingSpacesByEditorId = new Map<string, SpaceType[]>();

    for (const { spaceId, userIdsWithoutAccess } of spacesAccess) {
      const space = spaceById.get(spaceId);
      if (!space) {
        continue;
      }

      for (const userId of userIdsWithoutAccess) {
        const existing = missingSpacesByEditorId.get(userId);
        if (existing) {
          existing.push(space);
        } else {
          missingSpacesByEditorId.set(userId, [space]);
        }
      }
    }

    return (editors ?? []).flatMap((editor) => {
      const missingSpaces = missingSpacesByEditorId.get(editor.sId);
      return missingSpaces ? [{ editor, missingSpaces }] : [];
    });
  }, [editors, nonGlobalSpacesWithRestrictions, spacesAccess]);

  const value = useMemo(
    () => ({
      actionsBySpaceId,
      allSpaces,
      areSpaceRequirementsReady,
      editorsWithoutSpaceAccess,
      globalSpace,
      initialRequestedSpaceIds,
      knowledgeBySpaceId,
      missingSpaceIds,
      nonGlobalSpacesUsedBySkill,
      nonGlobalSpacesWithRestrictions,
      skillsBySpaceId,
      spaceIdsUsedBySkill,
    }),
    [
      actionsBySpaceId,
      allSpaces,
      areSpaceRequirementsReady,
      editorsWithoutSpaceAccess,
      globalSpace,
      initialRequestedSpaceIds,
      knowledgeBySpaceId,
      missingSpaceIds,
      nonGlobalSpacesUsedBySkill,
      nonGlobalSpacesWithRestrictions,
      skillsBySpaceId,
      spaceIdsUsedBySkill,
    ]
  );

  return (
    <SkillSpaceRestrictionsContext.Provider value={value}>
      {children}
    </SkillSpaceRestrictionsContext.Provider>
  );
}

export function useSkillSpaceRestrictionsContext(): SkillSpaceRestrictionsContextType {
  const context = useContext(SkillSpaceRestrictionsContext);
  if (!context) {
    throw new Error(
      "useSkillSpaceRestrictionsContext must be used within a SkillSpaceRestrictionsProvider"
    );
  }
  return context;
}
