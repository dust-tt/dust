import {
  ChevronDownIcon,
  Chip,
  Dialog,
  DropdownMenu,
  IconButton,
  LockIcon,
  PlanetIcon,
  UserGroupIcon,
} from "@dust-tt/sparkle";
import type { AgentConfigurationScope, WorkspaceType } from "@dust-tt/types";
import { isBuilder } from "@dust-tt/types";
import { useState } from "react";

import { assistantUsageMessage } from "@app/lib/assistant";
import { useAgentConfiguration, useAgentUsage } from "@app/lib/swr";

type ConfirmationModalDataType = {
  title: string;
  text: string;
  confirmText: string;
  usageText?: string;
  variant: "primary" | "primaryWarning";
};

/*
 * Note: Non-builders cannot change to/from company assistant
 */
export function TeamSharingSection({
  owner,
  agentConfigurationId,
  initialScope,
  newScope,
  setNewScope,
}: {
  owner: WorkspaceType;
  agentConfigurationId: string | null;
  initialScope: Exclude<AgentConfigurationScope, "global">;
  newScope: Exclude<AgentConfigurationScope, "global">;
  setNewScope: (scope: Exclude<AgentConfigurationScope, "global">) => void;
}) {
  const { agentConfiguration } = useAgentConfiguration({
    workspaceId: owner.sId,
    agentConfigurationId,
  });
  const assistantInMyList = agentConfiguration?.userListStatus === "in-list";
  const assistantName = agentConfiguration?.name;

  const [requestNewScope, setModalNewScope] = useState<Exclude<
    AgentConfigurationScope,
    "global"
  > | null>(null);
  const agentUsage = useAgentUsage({
    workspaceId: owner.sId,
    agentConfigurationId,
  });

  const usageText = assistantName
    ? assistantUsageMessage({
        assistantName,
        usage: agentUsage.agentUsage,
        isLoading: agentUsage.isAgentUsageLoading,
        isError: agentUsage.isAgentUsageError,
      })
    : "";

  const scopeInfo: Record<
    Exclude<AgentConfigurationScope, "global">,
    {
      label: string;
      color: string;
      icon: typeof UserGroupIcon | typeof PlanetIcon | typeof LockIcon;
      text: string;
      confirmationModalData: ConfirmationModalDataType;
    }
  > = {
    published: {
      label: "Shared Assistant",
      color: "pink",
      icon: UserGroupIcon,
      text: "Anyone in the workspace can view and edit.",
      confirmationModalData: {
        title: "Sharing an assistant",
        text: "Once shared, the assistant will be visible and editable by members of your workspace.",
        confirmText: "Share the assistant",
        variant: "primary",
      },
    },
    workspace: {
      label: "Company Assistant",
      color: "amber",
      icon: PlanetIcon,
      text: "Activated by default for all members of the workspace.",
      confirmationModalData: {
        title: "Moving to Company Assistants",
        text: "Moving the assistant to Company Assistants will make the assistant editable only by Admins and Builders and add it to every member's “My Assistants” list.",
        confirmText: "Move to Company",
        variant: "primary",
      },
    },
    private: {
      label: "Personal Assistant",
      color: "sky",
      icon: LockIcon,
      text: "Only I can view and edit.",
      confirmationModalData: {
        title: "Moving to Personal Assistants",
        text: `Moving the assistant to your Personal Assistants will make the assistant unaccessible to other members of the workspace.`,
        confirmText: "Move to Personal",
        variant: "primaryWarning",
        usageText,
      },
    },
  };

  // special case if changing setting from company to shared
  const companyToSharedModalData: ConfirmationModalDataType = {
    title: "Moving to Shared Assistants",
    text: `Moving ${
      assistantName || "the assistant"
    } to Shared Assistants will make the assistant editable by all members of the workspace and the assistant will not be activated by default anymore.`,
    confirmText: "Move to Shared",
    variant: "primary",
    usageText,
  };

  let confirmationModalData: ConfirmationModalDataType = {
    title: "",
    text: "",
    confirmText: "",
    variant: "primary",
  };

  if (requestNewScope) {
    confirmationModalData =
      requestNewScope === "published" && initialScope === "workspace"
        ? companyToSharedModalData
        : scopeInfo[requestNewScope].confirmationModalData;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-lg font-bold text-element-900">Sharing</div>
      <div>
        {requestNewScope && (
          <ScopeChangeModal
            show={requestNewScope !== null}
            confirmationModalData={confirmationModalData}
            onClose={() => setModalNewScope(null)}
            setSharingScope={() =>
              requestNewScope && setNewScope(requestNewScope)
            }
          />
        )}
        <DropdownMenu>
          <DropdownMenu.Button>
            <div className="group flex cursor-pointer items-center gap-2">
              <Chip
                label={scopeInfo[newScope].label}
                color={scopeInfo[newScope].color as "pink" | "amber" | "sky"}
                icon={scopeInfo[newScope].icon}
              />
              <IconButton
                icon={ChevronDownIcon}
                size="xs"
                variant="secondary"
                className="group-hover:text-action-400"
              />
            </div>
          </DropdownMenu.Button>
          <DropdownMenu.Items origin="topRight" width={200}>
            {Object.entries(scopeInfo)
              .filter(
                ([entryScope]) => isBuilder(owner) || entryScope !== "workspace"
              )
              .map(([entryScope, entryData]) => (
                <DropdownMenu.Item
                  key={entryData.label}
                  label={entryData.label}
                  icon={entryData.icon}
                  selected={entryScope === newScope}
                  onClick={() => {
                    // no need for modal in the following cases
                    if (
                      // selection unchanged
                      entryScope === newScope ||
                      // selection back to initial state
                      entryScope === initialScope ||
                      // change to personal or company, but the only user of the
                      // assistant is the user changing the scope
                      ((entryScope === "private" || entryScope === "company") &&
                        assistantInMyList &&
                        (!agentUsage.agentUsage ||
                          agentUsage.agentUsage.userCount <= 1))
                    ) {
                      setNewScope(
                        entryScope as Exclude<AgentConfigurationScope, "global">
                      );
                      return;
                    }
                    // in all other cases, show modal
                    setModalNewScope(
                      entryScope as Exclude<AgentConfigurationScope, "global">
                    );
                  }}
                />
              ))}
          </DropdownMenu.Items>
        </DropdownMenu>
      </div>
      <div className="text-sm text-element-700">
        <div>{scopeInfo[newScope].text}</div>
        {agentUsage &&
        agentUsage.agentUsage?.userCount &&
        agentUsage.agentUsage.userCount > 1
          ? usageText
          : null}
      </div>
    </div>
  );
}

function ScopeChangeModal({
  show,
  confirmationModalData,
  onClose,
  setSharingScope,
}: {
  show: boolean;
  confirmationModalData: ConfirmationModalDataType;
  onClose: () => void;
  setSharingScope: () => void;
}) {
  return (
    <Dialog
      isOpen={show}
      title={confirmationModalData.title}
      onCancel={onClose}
      validateLabel={confirmationModalData.confirmText}
      validateVariant={confirmationModalData.variant}
      onValidate={async () => {
        setSharingScope();
        onClose();
      }}
    >
      <div>
        <div className="pb-2">
          <span className="font-bold">{confirmationModalData.usageText}</span>
          {" " + confirmationModalData.text}
        </div>
        <div className="font-bold">Are you sure you want to proceed ?</div>
      </div>
    </Dialog>
  );
}
