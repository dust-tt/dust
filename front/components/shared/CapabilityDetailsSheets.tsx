import { MCPServerDetails } from "@app/components/actions/mcp/MCPServerDetails";
import { SkillDetailsSheet } from "@app/components/skills/SkillDetailsSheet";
import type { MCPServerViewLightType } from "@app/lib/api/mcp";
import { useMCPServer } from "@app/lib/swr/mcp_servers";
import { useSkill } from "@app/lib/swr/skill_configurations";
import type { UserType, WorkspaceType } from "@app/types/user";

interface CapabilityDetailsSheetsProps {
  owner: WorkspaceType;
  user: UserType | null;
  selectedSkillId: string | null;
  selectedMCPServerView: MCPServerViewLightType | null;
  onCloseSkill: () => void;
  onCloseTool: () => void;
  replaceOnSkillEdit?: boolean;
}

export function CapabilityDetailsSheets({
  owner,
  user,
  selectedSkillId,
  selectedMCPServerView,
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

  // List surfaces hold light views (no tools, no authorization); resolve the full view on
  // open from the server endpoint (SWR-deduped with MCPServerDetails' own fetch).
  const { server: mcpServerWithViews } = useMCPServer({
    owner,
    serverId: selectedMCPServerView?.server.sId ?? "",
    disabled: !selectedMCPServerView,
  });
  const fullMCPServerView =
    (selectedMCPServerView &&
      mcpServerWithViews?.views.find(
        (v) => v.sId === selectedMCPServerView.sId
      )) ??
    null;

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
        isOpen={selectedMCPServerView !== null}
        onClose={onCloseTool}
        readOnly
      />
    </>
  );
}
