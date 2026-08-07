import { AgentDetailsSheet } from "@app/components/assistant/details/AgentDetailsSheet";
import { SkillDetailsSheetById } from "@app/components/command_palette/SkillDetailsSheetById";
import type { UserType, WorkspaceType } from "@app/types/user";
import { useState } from "react";

/**
 * Shared "Used By" click-through state: clicking an agent or a skill in a `UsedByButton`
 * dropdown opens the corresponding details sheet. Factored out of `AdminActionsList` so
 * every other `UsedByButton` caller (Connections, space category rows, ...) doesn't have to
 * duplicate the agentId/skillId state and the two sheets.
 */
export function useUsedByDetailsSheets(owner: WorkspaceType, user: UserType) {
  const [agentId, setAgentId] = useState<string | null>(null);
  const [skillId, setSkillId] = useState<string | null>(null);

  return {
    onAgentClick: setAgentId,
    onSkillClick: setSkillId,
    sheets: (
      <>
        <AgentDetailsSheet
          owner={owner}
          user={user}
          agentId={agentId}
          onClose={() => setAgentId(null)}
        />
        <SkillDetailsSheetById
          owner={owner}
          user={user}
          skillId={skillId}
          onClose={() => setSkillId(null)}
        />
      </>
    ),
  };
}
