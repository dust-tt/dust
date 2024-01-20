import {
  ChevronDownIcon,
  Chip,
  DropdownMenu,
  IconButton,
  LockIcon,
  PlanetIcon,
  UserGroupIcon,
} from "@dust-tt/sparkle";
import type { AgentConfigurationScope, WorkspaceType } from "@dust-tt/types";
import { isBuilder } from "@dust-tt/types";

import { assistantUsageMessage } from "@app/lib/assistant";
import { useAgentUsage } from "@app/lib/swr";

/*
 * Note: Non-builders cannot change to/from company assistant
 */
export function TeamSharingSection({
  owner,
  agentConfigurationId,
  newScope,
  setNewScope,
}: {
  owner: WorkspaceType;
  agentConfigurationId: string | null;
  newScope: Exclude<AgentConfigurationScope, "global">;
  setNewScope: (scope: Exclude<AgentConfigurationScope, "global">) => void;
}) {
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [showWorkspaceRemoveDialog, setShowWorkspaceRemoveDialog] =
    useState(false);
  const agentUsage = agentConfigurationId
    ? useAgentUsage({
        workspaceId: owner.sId,
        agentConfigurationId,
      })
    : null;

  const scopeInfo: Record<
    Exclude<AgentConfigurationScope, "global">,
    {
      label: string;
      color: string;
      icon: typeof UserGroupIcon | typeof PlanetIcon | typeof LockIcon;
      text: string;
    }
  > = {
    published: {
      label: "Shared Assistant",
      color: "pink",
      icon: UserGroupIcon,
      text: "Anyone in the workspace can view and edit.",
    },
    workspace: {
      label: "Company Assistant",
      color: "amber",
      icon: PlanetIcon,
      text: "Activated by default for all members of the workspace.",
    },
    private: {
      label: "Personal Assistant",
      color: "sky",
      icon: LockIcon,
      text: "Only I can view and edit.",
    },
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="text-lg font-bold text-element-900">Sharing</div>
      <div>
        <DropdownMenu>
          <DropdownMenu.Button>
            <div className="flex cursor-pointer items-center gap-2">
              <Chip
                label={scopeInfo[newScope].label}
                color={scopeInfo[newScope].color as "pink" | "amber" | "sky"}
                icon={scopeInfo[newScope].icon}
              />
              <IconButton
                icon={ChevronDownIcon}
                size="xs"
                variant="secondary"
              />
            </div>
          </DropdownMenu.Button>
          <DropdownMenu.Items origin="topRight" width={200}>
            {Object.entries(scopeInfo)
              .filter((scope) => isBuilder(owner) || scope[0] !== "workspace")
              .map(([scope, data]) => (
                <DropdownMenu.Item
                  key={data.label}
                  label={data.label}
                  icon={data.icon}
                  selected={scope === newScope}
                  onClick={() =>
                    setNewScope(
                      scope as Exclude<AgentConfigurationScope, "global">
                    )
                  }
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
          ? assistantUsageMessage({
              usage: agentUsage.agentUsage,
              isLoading: agentUsage.isAgentUsageLoading,
              isError: agentUsage.isAgentUsageError,
            })
          : null}
      </div>
    </div>
  );

  /*if (initialScope === "published" && newScope === "published") {
    return (
      <div className="flex flex-col gap-3">
        <CreateDuplicateDialog
          show={showCreateDuplicateDialog}
          onClose={() => setShowCreateDuplicateDialog(false)}
          createDuplicate={() => {
            void router.push(
              `/w/${owner.sId}/builder/assistants/new?flow=personal_assistants&duplicate=${agentConfigurationId}`
            );
          }}
        />
        <div className="text-lg font-bold text-element-900">Team sharing</div>
        <div className="flex items-center gap-3">
          <div className="flex-grow text-sm text-element-700">
            This assistant can be discovered by everyone in the{" "}
            <span className="font-bold">Assistant Gallery</span>. Any edits will
            apply to everyone. You can create a duplicate to tweak your own,
            private version.
          </div>
          {agentConfigurationId && (
            <div>
              <Button
                variant="secondary"
                size="sm"
                label="Create a duplicate"
                onClick={() => setShowCreateDuplicateDialog(true)}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  if (initialScope === "workspace" && newScope === "workspace") {
    return (
      <div className="flex flex-col gap-3">
        <WorkspaceRemoveDialog
          show={showWorkspaceRemoveDialog}
          onClose={() => setShowWorkspaceRemoveDialog(false)}
          setPublished={() => setNewScope("published")}
        />
        <div className="text-lg font-bold text-element-900">Team sharing</div>
        <div className="flex items-center gap-3">
          <div className="flex-grow text-sm text-element-700">
            The assistant is in the workspace list. Only admins and builders can{" "}
            <span className="font-bold">modify and delete</span> the assistant.
            It is included by default in every member's list.
          </div>
          {isBuilder(owner) && (
            <Button
              variant="tertiary"
              size="sm"
              label="Remove from workspace list"
              onClick={() => setShowWorkspaceRemoveDialog(true)}
            />
          )}
        </div>
      </div>
    );
  }

  if (initialScope === "workspace" && newScope === "published") {
    return (
      <div className="flex flex-col gap-3">
        <div className="text-lg font-bold text-element-900">Team sharing</div>
        <div className="flex items-center gap-3">
          <div>
            <Icon
              visual={CheckCircleIcon}
              size="lg"
              className="text-success-500"
            />
          </div>
          <div className="flex-grow text-sm text-element-700">
            The assistant will be removed from the workspace list. It will be
            discoverable by members, but it won't be in their list by default.
            Any workspace member can modify the assistant.
          </div>
          <div>
            <Button
              variant="tertiary"
              size="sm"
              label="Keep in workspace list"
              onClick={() => setNewScope("workspace")}
            />
          </div>
        </div>
      </div>
    );
  }
}

function PublishDialog({
  show,
  onClose,
  setPublished,
}: {
  show: boolean;
  onClose: () => void;
  setPublished: () => void;
}) {
  return (
    <Dialog
      isOpen={show}
      title="Publishing to Assistant Gallery"
      onCancel={onClose}
      validateLabel="Ok"
      validateVariant="primary"
      onValidate={async () => {
        setPublished();
        onClose();
      }}
    >
      <div>
        Once published, the assistant will be visible and editable by members of
        your workspace.
      </div>
    </Dialog>
  );
}

function WorkspaceRemoveDialog({
  show,
  onClose,
  setPublished,
}: {
  show: boolean;
  onClose: () => void;
  setPublished: () => void;
}) {
  return (
    <Dialog
      isOpen={show}
      title="Removing from workspace list"
      onCancel={onClose}
      validateLabel="Remove"
      validateVariant="primaryWarning"
      onValidate={async () => {
        setPublished();
        onClose();
      }}
    >
      <div>
        Removing from the workspace leaves the assistant discoverable by
        members, but it won't be in their list by default. Any workspace member
        can modify the assistant.
      </div>
    </Dialog>
  );
}

function CreateDuplicateDialog({
  show,
  onClose,
  createDuplicate,
}: {
  show: boolean;
  onClose: () => void;
  createDuplicate: () => void;
}) {
  return (
    <Dialog
      isOpen={show}
      title="Creating a duplicate"
      onCancel={onClose}
      validateLabel="Ok"
      validateVariant="primary"
      onValidate={async () => {
        createDuplicate();
        onClose();
      }}
    >
      <div>
        An exact copy of the assistant will be created for you only. You will
        pick a new name and Avatar.
      </div>
    </Dialog>
  );*/
}
