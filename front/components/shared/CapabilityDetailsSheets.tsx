import { MCPServerDetails } from "@app/components/actions/mcp/MCPServerDetails";
import { SkillDetailsSheet } from "@app/components/skills/SkillDetailsSheet";
import type { MCPServerViewLightType } from "@app/lib/api/mcp";
import { useMCPServerView } from "@app/lib/swr/mcp_servers";
import { useSkill } from "@app/lib/swr/skill_configurations";
import type { UserType, WorkspaceType } from "@app/types/user";

interface CapabilityDetailsSheetsProps {
  owner: WorkspaceType;
  user: UserType | null;
  selectedSkillId: string | null;
  selectedMCPServerView: MCPServerViewLightType | null;
  selectedMCPServerViewId?: string | null;
  onCloseSkill: () => void;
  onCloseTool: () => void;
  replaceOnSkillEdit?: boolean;
}

export function CapabilityDetailsSheets({
  owner,
  user,
  selectedSkillId,
  selectedMCPServerView,
  selectedMCPServerViewId,
  onCloseSkill,
  onCloseTool,
  replaceOnSkillEdit,
}: CapabilityDetailsSheetsProps) {
  const { skill } = useSkill({
    workspaceId: owner.sId,
    skillId: selectedSkillId,
    withRelations: true,
    disabled: !selectedSkillId,
  });

  const { serverView: fullMCPServerView } = useMCPServerView({
    owner,
    viewId: selectedMCPServerView?.sId ?? selectedMCPServerViewId ?? null,
  });

  return (
    <>
      {user && (
        <SkillDetailsSheet
          skill={skill ?? null}
          owner={owner}
          user={user}
          onClose={onCloseSkill}
          replaceOnEdit={replaceOnSkillEdit}
        />
      )}

      <MCPServerDetails
        owner={owner}
        mcpServerView={fullMCPServerView}
        isOpen={selectedMCPServerView !== null || !!selectedMCPServerViewId}
        onClose={onCloseTool}
        readOnly
      />
    </>
  );
}
