import { DeleteAgentDialog } from "@app/components/assistant/DeleteAgentDialog";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useAppRouter } from "@app/lib/platform";
import { useAgentConfiguration } from "@app/lib/swr/assistants";
import { useWorkspacePermissions } from "@app/lib/swr/permissions";
import { hasHealthyProviders } from "@app/lib/utils/providersHealth";
import { getAgentBuilderRoute } from "@app/lib/utils/router";
import type { AgentConfigurationScope } from "@app/types/assistant/agent";
import type { LightWorkspaceType } from "@app/types/user";
import type { MenuItem } from "@dust-tt/sparkle";
import {
  Brackets,
  Clipboard,
  DataTable,
  Edit04,
  Eye,
  Trash01,
} from "@dust-tt/sparkle";
import type { MouseEvent } from "react";
import { useState } from "react";

interface AgentSearchActionsMenuProps {
  owner: LightWorkspaceType;
  agentId: string;
  scope: AgentConfigurationScope;
  onSelect: (agentId: string) => void;
  onRefresh: () => void;
}

// Search results carry no permissions, so the agent is fetched when the menu opens to decide
// which edit actions to offer.
export function AgentSearchActionsMenu({
  owner,
  agentId,
  scope,
  onSelect,
  onRefresh,
}: AgentSearchActionsMenuProps) {
  const router = useAppRouter();
  const { isAdmin, providersHealth } = useAuth();
  const { hasPermission } = useWorkspacePermissions();
  const [isOpen, setIsOpen] = useState(false);
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
  const isCustomAgent = scope !== "global";
  const {
    agentConfiguration,
    isAgentConfigurationLoading,
    isAgentConfigurationError,
    mutateAgentConfiguration,
  } = useAgentConfiguration({
    workspaceId: owner.sId,
    agentConfigurationId: agentId,
    disabled: !isCustomAgent || (!isOpen && !isArchiveDialogOpen),
  });

  const noHealthyProviders = !hasHealthyProviders(providersHealth);
  // Editing an agent (settings, archive) is reserved to its editors and to workspace admins.
  const canEdit =
    !!agentConfiguration && (agentConfiguration.canEdit || isAdmin);

  const withoutPropagation = (action: () => void) => (event: MouseEvent) => {
    event.stopPropagation();
    action();
  };

  const menuItems: MenuItem[] = [];
  if (isCustomAgent && isAgentConfigurationLoading) {
    menuItems.push({ kind: "item", label: "Loading actions…", disabled: true });
  }
  if (isCustomAgent && isAgentConfigurationError) {
    menuItems.push({
      kind: "item",
      label: "Could not load actions. Retry",
      onClick: (event) => {
        event.preventDefault();
        event.stopPropagation();
        void mutateAgentConfiguration();
      },
    });
  }
  if (canEdit && !noHealthyProviders) {
    menuItems.push({
      kind: "item",
      label: "Edit",
      icon: Edit04,
      onClick: withoutPropagation(
        () => void router.push(getAgentBuilderRoute(owner.sId, agentId))
      ),
    });
  }
  menuItems.push(
    {
      kind: "item",
      label: "Copy agent ID",
      icon: Brackets,
      onClick: withoutPropagation(
        () => void navigator.clipboard.writeText(agentId)
      ),
    },
    {
      kind: "item",
      label: "More info",
      icon: Eye,
      onClick: withoutPropagation(() => onSelect(agentId)),
    }
  );
  if (
    isCustomAgent &&
    hasPermission("create", "agent") &&
    !noHealthyProviders
  ) {
    menuItems.push({
      kind: "item",
      label: "Duplicate (New)",
      icon: Clipboard,
      onClick: withoutPropagation(
        () =>
          void router.push(
            getAgentBuilderRoute(owner.sId, "new", `duplicate=${agentId}`)
          )
      ),
    });
  }
  if (canEdit) {
    menuItems.push({
      kind: "item",
      label: "Archive",
      icon: Trash01,
      variant: "warning",
      onClick: withoutPropagation(() => setIsArchiveDialogOpen(true)),
    });
  }

  return (
    <>
      <DataTable.MoreButton
        menuItems={menuItems}
        dropdownMenuProps={{ onOpenChange: setIsOpen }}
      />
      {agentConfiguration && (
        <DeleteAgentDialog
          owner={owner}
          isOpen={isArchiveDialogOpen}
          agentConfiguration={agentConfiguration}
          onClose={() => {
            setIsArchiveDialogOpen(false);
            onRefresh();
          }}
        />
      )}
    </>
  );
}
