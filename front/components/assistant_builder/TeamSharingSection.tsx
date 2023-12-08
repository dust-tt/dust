import {
  Button,
  CheckCircleIcon,
  Dialog,
  Icon,
  ImageIcon,
  Tooltip,
} from "@dust-tt/sparkle";
import { AgentConfigurationScope, WorkspaceType } from "@dust-tt/types";
import { useState } from "react";

export function TeamSharingSection({
  owner,
  initialScope,
  newScope,
  setNewScope,
}: {
  owner: WorkspaceType;
  initialScope: AgentConfigurationScope;
  newScope: Exclude<AgentConfigurationScope, "global">;
  setNewScope: (scope: Exclude<AgentConfigurationScope, "global">) => void;
}) {
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [showWorkspaceRemoveDialog, setShowWorkspaceRemoveDialog] =
    useState(false);
  const [showCreateDuplicateDialog, setShowCreateDuplicateDialog] =
    useState(false);

  if (initialScope !== "private" && newScope === "private") {
    throw new Error("Cannot change scope back to private");
  }
  if (initialScope === "global") {
    return null;
  }

  if (initialScope === "private" && newScope === "private")
    return (
      <div className="flex flex-col gap-3">
        <div className="text-lg font-bold text-element-900">Team sharing</div>
        <div className="flex items-center gap-3">
          <PublishDialog
            show={showPublishDialog}
            onClose={() => setShowPublishDialog(false)}
            setPublished={() => setNewScope("published")}
          />
          <div>
            <Button
              variant="secondary"
              size="sm"
              label="Publish to Assistant Gallery"
              icon={ImageIcon}
              onClick={() => setShowPublishDialog(true)}
            />
          </div>
          <div className="flex-grow text-sm text-element-700">
            Make the assistant available to your team in the{" "}
            <span className="font-bold">Assistant Gallery</span>. <br /> Your
            team will be allowed to{" "}
            <span className="font-bold">use and modify</span> the assistant.
          </div>
        </div>
      </div>
    );

  if (initialScope === "private" && newScope === "published") {
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
            Make the assistant available to your team in the{" "}
            <span className="font-bold">Assistant Gallery</span>. <br /> Your
            team will be allowed to{" "}
            <span className="font-bold">use and modify</span> the assistant.
          </div>
          <div>
            <Button
              variant="tertiary"
              size="sm"
              label="Cancel publication"
              onClick={() => setNewScope("private")}
            />
          </div>
        </div>
      </div>
    );
  }

  if (initialScope === "published" && newScope === "published") {
    return (
      <div className="flex flex-col gap-3">
        <CreateDuplicateDialog
          show={showCreateDuplicateDialog}
          onClose={() => setShowCreateDuplicateDialog(false)}
          createDuplicate={function (): void {
            throw new Error("Function not implemented.");
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
          <div>
            <Tooltip label="Coming soon: you can create a duplicate to tweak your own, private version">
              <Button
                variant="secondary"
                size="sm"
                label="Create a duplicate"
                onClick={() => setShowCreateDuplicateDialog(true)}
                disabled={true}
              />
            </Tooltip>
          </div>
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
          {(owner.role === "admin" || owner.role === "builder") && (
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
  );
}
