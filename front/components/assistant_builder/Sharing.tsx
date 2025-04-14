import {
  ArrowUpOnSquareIcon,
  Button,
  ChevronDownIcon,
  Chip,
  CompanyIcon,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DustIcon,
  LockIcon,
  Page,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  SliderToggle,
  UserGroupIcon,
} from "@dust-tt/sparkle";
import { useState } from "react";

import { assistantUsageMessage } from "@app/components/assistant/Usage";
import type { SlackChannel } from "@app/components/assistant_builder/SlackIntegration";
import { SlackAssistantDefaultManager } from "@app/components/assistant_builder/SlackIntegration";
import { useAgentConfiguration, useAgentUsage } from "@app/lib/swr/assistants";
import type {
  AgentConfigurationScope,
  AgentConfigurationType,
  DataSourceType,
  LightWorkspaceType,
  WorkspaceType,
} from "@app/types";
import { isAdmin, isBuilder } from "@app/types";
import {
  useAssistantBuilderActions,
  useAssistantBuilderStore,
} from "@app/lib/stores/assistant-builder-provider";

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
    icon: typeof UserGroupIcon | typeof CompanyIcon | typeof LockIcon;
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
} as const;

type NonGlobalScope = Exclude<AgentConfigurationScope, "global">;

interface SharingButtonProps {
  agentConfigurationId: string | null;
  baseUrl: string;
  newScope: NonGlobalScope;
  owner: WorkspaceType;
  setNewLinkedSlackChannels: (channels: SlackChannel[]) => void;
  showSlackIntegration: boolean;
  slackChannelSelected: SlackChannel[];
  slackDataSource: DataSourceType | undefined;
}

export function SharingButton({
  agentConfigurationId,
  baseUrl,
  newScope,
  owner,
  setNewLinkedSlackChannels,
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
          show={slackDrawerOpened}
          slackDataSource={slackDataSource}
          onClose={() => setSlackDrawerOpened(false)}
        />
      )}
      <PopoverRoot open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            size="sm"
            label="Sharing"
            icon={ArrowUpOnSquareIcon}
            variant="outline"
            isSelect
            data-gtm-label="sharingButton"
            data-gtm-location="assistantBuilder"
            onClick={() => setIsPopoverOpen(!isPopoverOpen)}
          />
        </PopoverTrigger>
        <PopoverContent>
          <div className="flex flex-col gap-y-2 py-1">
            <div className="flex flex-col gap-y-3">
              <SharingDropdown
                owner={owner}
                agentConfiguration={agentConfiguration}
                newScope={newScope}
                origin="page"
              />
              <div className="text-sm text-muted-foreground">
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
                    <div className="heading-base text-muted-foreground">
                      Slack integration
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {slackChannelSelected.length === 0 ? (
                        <>Set as default agent for specific&nbsp;channels.</>
                      ) : (
                        <>
                          Default agent for{" "}
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
                          variant="outline"
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
                        (slackChannelSelected.length > 0 && !isAdmin(owner))
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
                    <div className="heading-base text-muted-foreground">
                      Link
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Shareable direct&nbsp;URL
                    </div>
                  </div>
                  <div className="pt-4 text-right">
                    <Button
                      size="sm"
                      label={copyLinkSuccess ? "Copied!" : "Copy link"}
                      variant="outline"
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

interface SharingDropdownProps {
  owner: LightWorkspaceType;
  agentConfiguration: AgentConfigurationType | null;
  disabled?: boolean;
  newScope: AgentConfigurationScope;
  origin: "page" | "modal";
}

/*
 * Note: Non-builders cannot change to/from company agent
 */
export function SharingDropdown({
  owner,
  agentConfiguration,
  disabled,
  newScope,
  origin,
}: SharingDropdownProps) {
  const { updateScope } = useAssistantBuilderActions();
  const initialScope = useAssistantBuilderStore((state) => state.initialScope);
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

  const allowedToChange =
    !disabled &&
    // never change global agent
    initialScope !== "global" &&
    // only builders can change company agents
    (isBuilder(owner) || initialScope !== "workspace");

  return (
    <div>
      {requestNewScope && confirmationModalData && (
        <ScopeChangeDialog
          show={requestNewScope !== null}
          confirmationModalData={confirmationModalData}
          usageText={confirmationModalData.showUsage ? usageText : undefined}
          onClose={() => setModalNewScope(null)}
          setSharingScope={() =>
            requestNewScope && updateScope(requestNewScope)
          }
        />
      )}
      <DropdownMenu modal={origin === "modal"}>
        <DropdownMenuTrigger disabled={!allowedToChange} asChild>
          <div className="group flex cursor-pointer items-center gap-2">
            <SharingChip scope={newScope} />
            {allowedToChange && (
              <Button icon={ChevronDownIcon} size="xs" variant="ghost" />
            )}
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {Object.entries(SCOPE_INFO)
            .filter(
              // can't change to those scopes
              ([entryScope]) =>
                entryScope !== "global" &&
                (isBuilder(owner) || entryScope !== "workspace")
            )
            .map(([entryScope, entryData]) => (
              <DropdownMenuItem
                key={entryData.label}
                label={entryData.label}
                icon={entryData.icon}
                onClick={() => {
                  /**
                   * Skip confirmation modal in the following cases:
                   * 1. Agent is being created (agentConfiguration is null)
                   * 2. Selection is unchanged (newScope === value)
                   * 3. Selection reverts to initial state (value === initialScope)
                   */
                  const shouldSkipModal =
                    !agentConfiguration ||
                    newScope === entryScope ||
                    entryScope === initialScope;

                  if (shouldSkipModal) {
                    updateScope(entryScope as NonGlobalScope);
                    return;
                  }

                  // Show confirmation modal for scope changes on existing agents
                  setModalNewScope(entryScope as NonGlobalScope);
                }}
              />
            ))}
        </DropdownMenuContent>
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
