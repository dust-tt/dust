import {
  Chip,
  CompanyIcon,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DustIcon,
  LockIcon,
  UserGroupIcon,
} from "@dust-tt/sparkle";
import { useState } from "react";

import { assistantUsageMessage } from "@app/components/assistant/Usage";
import { useAgentUsage } from "@app/lib/swr/assistants";
import type {
  AgentConfigurationScope,
  AgentConfigurationType,
  LightWorkspaceType,
} from "@app/types";

type ConfirmationModalDataType = {
  title: string;
  text: string;
  confirmText: string;
  showUsage?: boolean;
  variant: "primary" | "warning";
};

export const SCOPE_INFO: Record<
  AgentConfigurationScope,
  {
    shortLabel: string;
    label: string;
    color: "green" | "golden" | "blue" | "primary";
    icon?: typeof UserGroupIcon | undefined;
    text: string;
    confirmationModalData: ConfirmationModalDataType | null;
  }
> = {
  workspace: {
    shortLabel: "Company",
    label: "Company Agent",
    color: "golden",
    icon: CompanyIcon,
    text: "Activated by default for all members of the workspace.",
    confirmationModalData: {
      title: "Moving to Company Agents",
      text: "The agent automatically appears in every member's 'My Agents' list. It's editable by Admins and Builders only.",
      confirmText: "Move to Company",
      variant: "primary",
    },
  },
  published: {
    shortLabel: "Shared",
    label: "Shared Agent",
    color: "green",
    icon: UserGroupIcon,
    text: "Anyone in the workspace can view and edit.",
    confirmationModalData: {
      title: "Moving to Shared Agents",
      text: "The agent is editable and viewable by all workspace members.",
      confirmText: "Move to Shared",
      variant: "primary",
    },
  },
  private: {
    shortLabel: "Personal",
    label: "Personal Agent",
    color: "blue",
    icon: LockIcon,
    text: "Only I can view and edit.",
    confirmationModalData: {
      title: "Moving to Personal Agents",
      text: `The agent is only editable, viewable and usable by you.`,
      confirmText: "Move to Personal",
      variant: "warning",
      showUsage: true,
    },
  },
  global: {
    shortLabel: "Default",
    label: "Default Agent",
    color: "primary",
    icon: DustIcon,
    text: "Default agents provided by Dust.",
    confirmationModalData: null,
  },
  hidden: {
    shortLabel: "Not published",
    label: "Not published",
    color: "primary",
    text: "Hidden agents.",
    confirmationModalData: {
      title: "Moving to Hidden Agents",
      text: "The agent is editable and viewable by editors only.",
      confirmText: "Move to Hidden",
      variant: "primary",
    },
  },
  visible: {
    shortLabel: "Published",
    label: "Published",
    color: "green",
    text: "Visible agents.",
    confirmationModalData: {
      title: "Moving to Visible Agents",
      text: "The agent is viewable by all workspace members, and can be edited by editors only.",
      confirmText: "Move to Visible",
      variant: "primary",
    },
  },
} as const;

type NonGlobalScope = Exclude<AgentConfigurationScope, "global">;

interface SharingDropdownProps {
  owner: LightWorkspaceType;
  agentConfiguration: AgentConfigurationType | null;
  initialScope: AgentConfigurationScope;
  newScope: AgentConfigurationScope;
  setNewScope: (scope: NonGlobalScope) => void;
}

/*
 * Note: Non-builders cannot change to/from company agent
 */
export function SharingDropdown({
  owner,
  agentConfiguration,
  initialScope,
  newScope,
  setNewScope,
}: SharingDropdownProps) {
  const [requestNewScope, setModalNewScope] = useState<NonGlobalScope | null>(
    null
  );

  const agentUsage = useAgentUsage({
    workspaceId: owner.sId,
    agentConfigurationId: agentConfiguration?.sId || null,
  });
  const assistantName = agentConfiguration?.name;

  const usageText = assistantName
    ? assistantUsageMessage({
        assistantName,
        usage: agentUsage.agentUsage,
        isLoading: agentUsage.isAgentUsageLoading,
        isError: agentUsage.isAgentUsageError,
        boldVersion: true,
      })
    : "";

  // special case if changing setting from company to shared
  const companyToSharedModalData: ConfirmationModalDataType = {
    title: "Moving to Shared Agents",
    text: `${
      assistantName || "Agent"
    } will be editable by all members; it won't automatically appear in workspace member's 'My Agents' list.`,
    confirmText: "Move to Shared",
    variant: "primary",
    showUsage: true,
  };

  let confirmationModalData: ConfirmationModalDataType | null = {
    title: "",
    text: "",
    confirmText: "",
    variant: "primary",
  };

  if (requestNewScope) {
    confirmationModalData =
      requestNewScope === "published" && initialScope === "workspace"
        ? companyToSharedModalData
        : SCOPE_INFO[requestNewScope].confirmationModalData;
  }

  return (
    <div>
      {requestNewScope && confirmationModalData && (
        <ScopeChangeDialog
          show={requestNewScope !== null}
          confirmationModalData={confirmationModalData}
          usageText={confirmationModalData.showUsage ? usageText : undefined}
          onClose={() => setModalNewScope(null)}
          setSharingScope={() =>
            requestNewScope && setNewScope(requestNewScope)
          }
        />
      )}
      <div className="group flex cursor-pointer items-center gap-2">
        <SharingChip scope={newScope} />
      </div>
    </div>
  );
}

export function SharingChip({ scope }: { scope: AgentConfigurationScope }) {
  return (
    <Chip
      color={SCOPE_INFO[scope].color}
      icon={SCOPE_INFO[scope].icon || undefined}
    >
      {SCOPE_INFO[scope].label}
    </Chip>
  );
}

function ScopeChangeDialog({
  show,
  confirmationModalData,
  usageText,
  onClose,
  setSharingScope,
}: {
  show: boolean;
  confirmationModalData: ConfirmationModalDataType;
  usageText?: React.ReactNode;
  onClose: () => void;
  setSharingScope: () => void;
}) {
  return (
    <Dialog
      open={show}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader hideButton>
          <DialogTitle>{confirmationModalData.title}</DialogTitle>
          {usageText && <DialogDescription>{usageText}</DialogDescription>}
        </DialogHeader>
        <DialogContainer>
          <div>
            {confirmationModalData.text}
            <div className="font-bold">Are you sure you want to proceed ?</div>
          </div>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: () => {
              onClose();
            },
          }}
          rightButtonProps={{
            label: confirmationModalData.confirmText,
            variant: "warning",
            onClick: async () => {
              setSharingScope();
              onClose();
            },
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
