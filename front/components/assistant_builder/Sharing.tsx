import {
  ArrowUpOnSquareIcon,
  Button,
  ChevronDownIcon,
  Chip,
  CompanyIcon,
  Dialog,
  DropdownMenu,
  DustIcon,
  IconButton,
  LockIcon,
  Page,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  SliderToggle,
  UserGroupIcon,
} from "@dust-tt/sparkle";
import type {
  AgentConfigurationScope,
  AgentConfigurationType,
  DataSourceType,
  WorkspaceType,
} from "@dust-tt/types";
import { isBuilder } from "@dust-tt/types";
import { useState } from "react";

import { assistantUsageMessage } from "@app/components/assistant/Usage";
import type { SlackChannel } from "@app/components/assistant_builder/SlackIntegration";
import { SlackAssistantDefaultManager } from "@app/components/assistant_builder/SlackIntegration";
import { useAgentConfiguration, useAgentUsage } from "@app/lib/swr/assistants";

type ConfirmationModalDataType = {
  title: string;
  text: string;
  confirmText: string;
  showUsage?: boolean;
  variant: "primary" | "primaryWarning";
};

export const SCOPE_INFO: Record<
  AgentConfigurationScope,
  {
    shortLabel: string;
    label: string;
    color: "pink" | "amber" | "sky" | "slate";
    icon: typeof UserGroupIcon | typeof CompanyIcon | typeof LockIcon;
    text: string;
    confirmationModalData: ConfirmationModalDataType | null;
  }
> = {
  workspace: {
    shortLabel: "Company",
    label: "Company Assistant",
    color: "amber",
    icon: CompanyIcon,
    text: "Activated by default for all members of the workspace.",
    confirmationModalData: {
      title: "Moving to Company Assistants",
      text: "The assistant automatically appears in every member's 'My Assistants' list. It's editable by Admins and Builders only.",
      confirmText: "Move to Company",
      variant: "primary",
    },
  },
  published: {
    shortLabel: "Shared",
    label: "Shared Assistant",
    color: "pink",
    icon: UserGroupIcon,
    text: "Anyone in the workspace can view and edit.",
    confirmationModalData: {
      title: "Moving to Shared Assistants",
      text: "The assistant is editable and viewable by all workspace members.",
      confirmText: "Move to Shared",
      variant: "primary",
    },
  },
  private: {
    shortLabel: "Personal",
    label: "Personal Assistant",
    color: "sky",
    icon: LockIcon,
    text: "Only I can view and edit.",
    confirmationModalData: {
      title: "Moving to Personal Assistants",
      text: `The assistant is only editable, viewable and usable by you.`,
      confirmText: "Move to Personal",
      variant: "primaryWarning",
      showUsage: true,
    },
  },
  global: {
    shortLabel: "Default",
    label: "Default Assistant",
    color: "slate",
    icon: DustIcon,
    text: "Default assistants provided by Dust.",
    confirmationModalData: null,
  },
} as const;

type NonGlobalScope = Exclude<AgentConfigurationScope, "global">;

interface SharingButtonProps {
  agentConfigurationId: string | null;
  baseUrl: string;
  initialScope: NonGlobalScope;
  isAdmin: boolean;
  newScope: NonGlobalScope;
  owner: WorkspaceType;
  setNewLinkedSlackChannels: (channels: SlackChannel[]) => void;
  setNewScope: (scope: NonGlobalScope) => void;
  showSlackIntegration: boolean;
  slackChannelSelected: SlackChannel[];
  slackDataSource: DataSourceType | undefined;
}

export function SharingButton({
  agentConfigurationId,
  baseUrl,
  initialScope,
  isAdmin,
  newScope,
  owner,
  setNewLinkedSlackChannels,
  setNewScope,
  showSlackIntegration,
  slackChannelSelected,
  slackDataSource,
}: SharingButtonProps) {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const { agentUsage, isAgentUsageLoading, isAgentUsageError } = useAgentUsage({
    workspaceId: owner.sId,
    agentConfigurationId,
  });
  const { agentConfiguration } = useAgentConfiguration({
    workspaceId: owner.sId,
    agentConfigurationId,
  });
  const [slackDrawerOpened, setSlackDrawerOpened] = useState(false);
  const assistantName = agentConfiguration?.name;

  const usageText = assistantName
    ? assistantUsageMessage({
        assistantName: null,
        usage: agentUsage,
        isLoading: isAgentUsageLoading,
        isError: isAgentUsageError,
        boldVersion: true,
      })
    : "";

  const shareLink = `${baseUrl}/w/${owner.sId}/assistant/new?assistantDetails=${agentConfigurationId}`;
  const [copyLinkSuccess, setCopyLinkSuccess] = useState<boolean>(false);

  return (
    <>
      {slackDataSource && (
        <SlackAssistantDefaultManager
          existingSelection={slackChannelSelected}
          owner={owner}
          onSave={(slackChannels: SlackChannel[]) => {
            setNewLinkedSlackChannels(slackChannels);
          }}
          assistantHandle="@Dust"
          isAdmin={isAdmin}
          show={slackDrawerOpened}
          slackDataSource={slackDataSource}
          onClose={() => setSlackDrawerOpened(false)}
        />
      )}
      <PopoverRoot open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
        <PopoverTrigger>
          <Button
            size="sm"
            label="Sharing"
            icon={ArrowUpOnSquareIcon}
            variant="tertiary"
            type="menu"
            onClick={() => setIsPopoverOpen(!isPopoverOpen)}
          />
        </PopoverTrigger>
        <PopoverContent>
          <div className="flex flex-col gap-y-2 py-1">
            <div className="flex flex-col gap-y-3">
              <SharingDropdown
                owner={owner}
                agentConfiguration={agentConfiguration}
                initialScope={initialScope}
                newScope={newScope}
                setNewScope={setNewScope}
              />
              <div className="text-sm text-element-700">
                <div>
                  {SCOPE_INFO[newScope].text}{" "}
                  {agentUsage && newScope !== "private" ? usageText : null}
                </div>
              </div>
            </div>
            {showSlackIntegration && (
              <>
                <Page.Separator />
                <div className="flex flex-row justify-between">
                  <div>
                    <div className="text-base font-bold text-element-800">
                      Slack integration
                    </div>
                    <div className="text-sm text-element-700">
                      {slackChannelSelected.length === 0 ? (
                        <>
                          Set as default assistant for specific&nbsp;channels.
                        </>
                      ) : (
                        <>
                          Default assistant for{" "}
                          {slackChannelSelected
                            .map((c) => c.slackChannelName)
                            .join(", ")}
                        </>
                      )}
                    </div>

                    {slackChannelSelected.length > 0 && (
                      <div className="pt-3">
                        <Button
                          size="xs"
                          variant="secondary"
                          label="Manage channels"
                          onClick={() => {
                            setIsPopoverOpen(false);
                            setSlackDrawerOpened(true);
                          }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="pt-4">
                    <SliderToggle
                      selected={slackChannelSelected.length > 0}
                      // If not admins, but there are channels selected, prevent from removing.
                      disabled={
                        !slackDataSource ||
                        (slackChannelSelected.length > 0 && !isAdmin)
                      }
                      onClick={() => {
                        if (slackChannelSelected.length > 0) {
                          setNewLinkedSlackChannels([]);
                        } else {
                          setIsPopoverOpen(false);
                          setSlackDrawerOpened(true);
                        }
                      }}
                    />
                  </div>
                </div>
              </>
            )}
            {agentConfigurationId && (
              <>
                <Page.Separator />
                <div className="flex w-full flex-row">
                  <div className="grow">
                    <div className="text-base font-bold text-element-800">
                      Link
                    </div>
                    <div className="text-sm text-element-700">
                      Shareable direct&nbsp;URL
                    </div>
                  </div>
                  <div className="pt-4 text-right">
                    <Button
                      size="sm"
                      label={copyLinkSuccess ? "Copied!" : "Copy link"}
                      variant="secondary"
                      onClick={async () => {
                        await navigator.clipboard.writeText(shareLink);
                        setCopyLinkSuccess(true);
                        setTimeout(() => {
                          setCopyLinkSuccess(false);
                        }, 1000);
                      }}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        </PopoverContent>
      </PopoverRoot>
    </>
  );
}

/*
 * Note: Non-builders cannot change to/from company assistant
 */
export function SharingDropdown({
  owner,
  agentConfiguration,
  disabled,
  initialScope,
  newScope,
  setNewScope,
}: {
  owner: WorkspaceType;
  agentConfiguration: AgentConfigurationType | null;
  disabled?: boolean;
  initialScope: AgentConfigurationScope;
  newScope: AgentConfigurationScope;
  setNewScope: (scope: NonGlobalScope) => void;
}) {
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
    title: "Moving to Shared Assistants",
    text: `${
      assistantName || "Assistant"
    } will be editable by all members; it won't automatically appear in workspace member's 'My Assistants' list.`,
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

  const allowedToChange =
    !disabled &&
    // never change global assistant
    initialScope !== "global" &&
    // only builders can change company assistants
    (isBuilder(owner) || initialScope !== "workspace");

  return (
    <div>
      {requestNewScope && confirmationModalData && (
        <ScopeChangeModal
          show={requestNewScope !== null}
          confirmationModalData={confirmationModalData}
          usageText={confirmationModalData.showUsage ? usageText : undefined}
          onClose={() => setModalNewScope(null)}
          setSharingScope={() =>
            requestNewScope && setNewScope(requestNewScope)
          }
        />
      )}
      <DropdownMenu>
        <DropdownMenu.Button disabled={!allowedToChange}>
          <div className="group flex cursor-pointer items-center gap-2">
            <SharingChip scope={newScope} />
            {allowedToChange && (
              <IconButton
                icon={ChevronDownIcon}
                size="sm"
                variant="secondary"
                className="group-hover:text-action-400"
              />
            )}
          </div>
        </DropdownMenu.Button>
        <DropdownMenu.Items origin="topRight" width={200}>
          {Object.entries(SCOPE_INFO)
            .filter(
              // can't change to those scopes
              ([entryScope]) =>
                entryScope !== "global" &&
                (isBuilder(owner) || entryScope !== "workspace")
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
                    // assistant is being created
                    !agentConfiguration ||
                    // selection unchanged
                    entryScope === newScope ||
                    // selection back to initial state
                    entryScope === initialScope
                  ) {
                    setNewScope(entryScope as NonGlobalScope);
                    return;
                  }
                  // in all other cases, show modal
                  setModalNewScope(entryScope as NonGlobalScope);
                }}
              />
            ))}
        </DropdownMenu.Items>
      </DropdownMenu>
    </div>
  );
}

export function SharingChip({ scope }: { scope: AgentConfigurationScope }) {
  return (
    <Chip color={SCOPE_INFO[scope].color} icon={SCOPE_INFO[scope].icon}>
      {SCOPE_INFO[scope].label}
    </Chip>
  );
}

function ScopeChangeModal({
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
          {usageText && <span className="font-bold">{usageText}&nbsp;</span>}
          {confirmationModalData.text}
        </div>
        <div className="font-bold">Are you sure you want to proceed ?</div>
      </div>
    </Dialog>
  );
}
