/**
 * Markdown directive plugin for conversational skill suggestions.
 *
 * `suggest_skill_update` (building_agents_and_skills MCP) records a pending suggestion and emits
 * `:skill_suggestion[]{sId=xxx kind=yyy skillId=zzz}`. The directive carries identifiers only: the
 * card below resolves the suggestion and the skill it targets through their SWR hooks.
 */

import { SkillSuggestionCard } from "@app/components/skill_builder/SkillSuggestionCard";
import {
  usePatchSkillSuggestions,
  useSkillSuggestions,
} from "@app/hooks/useSkillSuggestions";
import { useSkill } from "@app/lib/swr/skill_configurations";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { SkillSuggestionType } from "@app/types/suggestions/skill_suggestion";
import type { LightWorkspaceType } from "@app/types/user";
import { LoadingBlock } from "@dust-tt/sparkle";
import { useCallback, useState } from "react";
import { SKIP, visit } from "unist-util-visit";

function toSuggestionProperties(attributes: Record<string, string>) {
  return {
    suggestionId: attributes.sId,
    kind: attributes.kind,
    skillId: attributes.skillId,
  };
}

/**
 * Remark directive plugin for parsing skill suggestion directives.
 *
 * Transforms `:skill_suggestion[]{sId=xxx kind=yyy skillId=zzz}` into a custom HTML element
 * that can be rendered by the suggestion card component.
 */
export function skillSuggestionDirective() {
  return (tree: any) => {
    visit(tree, ["textDirective", "leafDirective"], (node) => {
      if (node.name === "skill_suggestion") {
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        const data = node.data || (node.data = {});
        data.hName = "skill_suggestion";
        data.hProperties = toSuggestionProperties(node.attributes);
      }
    });

    // Models may not output a newline before the directive
    // (e.g. "issues::skill_suggestion[]{sId=xxx skillId=yyy}" — the prefix
    // prevents remarkDirective from parsing it). We drop the prefix and render the directive.
    visit(tree, "text", (node, index, parent) => {
      if (!parent || index === null) {
        return;
      }
      const match = /::skill_suggestion\[\]\{([^}]*)\}/.exec(node.value);
      if (!match) {
        return;
      }
      const attrs = Object.fromEntries(
        [...match[1].matchAll(/(\w+)=([^\s}]+)/g)].map((m) => [m[1], m[2]])
      );
      // Replace the entire text node (incl. leaked prefix) with a leafDirective node.
      parent.children = [
        ...parent.children.slice(0, index),
        {
          type: "leafDirective",
          name: "skill_suggestion",
          attributes: attrs,
          children: [],
          data: {
            hName: "skill_suggestion",
            hProperties: toSuggestionProperties(attrs),
          },
        },
        ...parent.children.slice(index + 1),
      ];

      return [SKIP, index];
    });
  };
}

interface ConversationSkillSuggestionProps {
  owner: LightWorkspaceType;
  skillId: string;
  suggestionId: string;
}

function ConversationSkillSuggestion({
  owner,
  skillId,
  suggestionId,
}: ConversationSkillSuggestionProps) {
  const [pendingAction, setPendingAction] = useState<
    "accept" | "decline" | null
  >(null);

  const { suggestions, isSuggestionsLoading, mutateSuggestions } =
    useSkillSuggestions({
      skillId,
      workspaceId: owner.sId,
      sources: ["conversational"],
    });

  const { skill, isSkillLoading } = useSkill({
    workspaceId: owner.sId,
    skillId,
  });

  const { patchSuggestions } = usePatchSkillSuggestions({
    skillId,
    workspaceId: owner.sId,
  });

  const getSkillInstructionsHtml = useCallback(
    () => skill?.instructionsHtml ?? "",
    [skill]
  );
  const getCurrentAgentFacingDescription = useCallback(
    () => skill?.agentFacingDescription ?? "",
    [skill]
  );

  // TODO(skill-suggestions): apply the suggestion's edits to the skill and mark it approved.
  const handleAccept = () => {};

  const handleDecline = async (suggestion: SkillSuggestionType) => {
    if (pendingAction) {
      return;
    }
    setPendingAction("decline");
    try {
      const patched = await patchSuggestions([suggestion.sId], "rejected");
      const reviewed = patched?.suggestions.find(
        (p) => p.sId === suggestion.sId
      );
      if (reviewed) {
        void mutateSuggestions(
          (current) => ({
            suggestions: (current?.suggestions ?? []).map((s) =>
              s.sId === reviewed.sId ? reviewed : s
            ),
          }),
          { revalidate: false }
        );
      }
    } finally {
      setPendingAction(null);
    }
  };

  if (isSuggestionsLoading || isSkillLoading) {
    return <LoadingBlock className="h-24 w-full" />;
  }

  const suggestion = suggestions.find((s) => s.sId === suggestionId);
  if (!suggestion || !skill) {
    return null;
  }

  const { kind } = suggestion;
  switch (kind) {
    case "edit":
      return (
        <SkillSuggestionCard
          suggestion={suggestion}
          onAccept={handleAccept}
          onDecline={handleDecline}
          getSkillInstructionsHtml={getSkillInstructionsHtml}
          getCurrentAgentFacingDescription={getCurrentAgentFacingDescription}
          workspaceId={owner.sId}
          disabled={pendingAction !== null}
          isAccepting={pendingAction === "accept"}
          isDeclining={pendingAction === "decline"}
        />
      );

    case "editors":
      return null;

    default:
      assertNeverAndIgnore(kind);
      return null;
  }
}

interface SkillSuggestionPluginProps {
  suggestionId?: string;
  skillId?: string;
}

export function getSkillSuggestionPlugin(owner: LightWorkspaceType) {
  const SkillSuggestionPlugin = ({
    suggestionId,
    skillId,
  }: SkillSuggestionPluginProps) =>
    suggestionId && skillId ? (
      <ConversationSkillSuggestion
        owner={owner}
        skillId={skillId}
        suggestionId={suggestionId}
      />
    ) : null;

  return SkillSuggestionPlugin;
}
