import { MCPServerDetails } from "@app/components/actions/mcp/MCPServerDetails";
import { SkillDetailsSheet } from "@app/components/skills/SkillDetailsSheet";
import type { MCPServerViewLightType } from "@app/lib/api/mcp";
import {
  useJITMCPServerViewsFromSpaces,
  useMCPServer,
} from "@app/lib/swr/mcp_servers";
import { useSkill } from "@app/lib/swr/skill_configurations";
import { useSpaces } from "@app/lib/swr/spaces";
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

  // Inline references retain the view ID, so resolve the light view only on open.
  const { spaces } = useSpaces({
    workspaceId: owner.sId,
    kinds: ["global"],
    disabled: !selectedMCPServerViewId,
  });
  const { serverViews } = useJITMCPServerViewsFromSpaces(owner, spaces, {
    disabled: !selectedMCPServerViewId,
  });
  const selectedView =
    selectedMCPServerView ??
    serverViews.find((view) => view.sId === selectedMCPServerViewId) ??
    null;

  // List surfaces hold light views (no tools, no authorization); resolve the full view on
  // open from the server endpoint (SWR-deduped with MCPServerDetails' own fetch).
  const { server: mcpServerWithViews } = useMCPServer({
    owner,
    serverId: selectedView?.server.sId ?? "",
    disabled: !selectedView,
  });
  const fullMCPServerView =
    (selectedView &&
      mcpServerWithViews?.views.find((v) => v.sId === selectedView.sId)) ??
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
        isOpen={!!selectedView || !!selectedMCPServerViewId}
        onClose={onCloseTool}
        readOnly
      />
    </>
  );
}
