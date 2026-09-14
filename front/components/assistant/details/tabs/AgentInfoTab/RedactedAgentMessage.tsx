import { ConfirmContext } from "@app/components/Confirm";
import { BecomeEditorButton } from "@app/components/shared/BecomeEditorButton";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useUpdateEditors } from "@app/lib/swr/agent_editors";
import { useAgentConfiguration } from "@app/lib/swr/assistants";
import {
  useAddSpaceMembers,
  useSpaces,
  useSpacesAsAdmin,
} from "@app/lib/swr/spaces";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type { WorkspaceType } from "@app/types/user";
import { Button, ContentMessage, Lock01, UsersPlus } from "@dust-tt/sparkle";
import { useContext, useState } from "react";

// Explains to an admin why the private fields of an agent were redacted: the agent is not
// published and they are not an editor, and/or it uses restricted spaces they are not a member of.
export function RedactedAgentMessage({
  agentConfiguration,
  owner,
}: {
  agentConfiguration: AgentConfigurationType;
  owner: WorkspaceType;
}) {
  // Spaces the caller is a member of, and every space of the workspace to name the missing ones.
  const { spaces: memberSpaces } = useSpaces({
    workspaceId: owner.sId,
    kinds: "all",
  });
  const { spaces: allSpaces } = useSpacesAsAdmin({ workspaceId: owner.sId });
  const { user } = useAuth();
  const updateEditors = useUpdateEditors({
    owner,
    agentConfigurationId: agentConfiguration.sId,
  });
  const [isAddingSelfAsEditor, setIsAddingSelfAsEditor] = useState(false);
  const confirm = useContext(ConfirmContext);

  // Same flow as the agent builder's "Become an editor": the editors update refetches the agent,
  // which comes back unredacted once the caller is an editor.
  const handleAddSelfAsEditor = async () => {
    if (isAddingSelfAsEditor) {
      return;
    }
    const confirmed = await confirm({
      title: "Security notice",
      message:
        "By becoming an editor you will have access to this agent's private data " +
        "(instructions, skills, knowledge). This action will be logged for security " +
        "purposes. Do you want to proceed?",
      validateLabel: "Proceed",
      validateVariant: "warning",
    });
    if (!confirmed) {
      return;
    }
    setIsAddingSelfAsEditor(true);
    try {
      await updateEditors({ addEditorIds: [user.sId] });
    } finally {
      setIsAddingSelfAsEditor(false);
    }
  };

  const memberSpaceIds = new Set(memberSpaces.map((s) => s.sId));
  const spaceById = new Map(allSpaces.map((s) => [s.sId, s]));
  const missingSpaceIds = agentConfiguration.requestedSpaceIds.filter(
    (sId) => !memberSpaceIds.has(sId)
  );
  const missingSpaceNames = missingSpaceIds.map(
    (sId) => spaceById.get(sId)?.name ?? sId
  );

  const addSpaceMembers = useAddSpaceMembers({ owner });
  const { mutateAgentConfiguration } = useAgentConfiguration({
    workspaceId: owner.sId,
    agentConfigurationId: agentConfiguration.sId,
    disabled: true, // We only use the hook to mutate the cache
  });
  const [isJoiningSpaces, setIsJoiningSpaces] = useState(false);

  // Adds the admin to every requested space they are not a member of, through the same members
  // update (and the same security notice) as the space settings modal.
  const handleJoinSpaces = async () => {
    if (isJoiningSpaces) {
      return;
    }
    const confirmed = await confirm({
      title: "Security notice",
      message:
        `You are about to join ${missingSpaceIds.length === 1 ? "this space" : "these spaces"}. ` +
        "This action will be logged for security purposes. Do you want to proceed?",
      validateLabel: "Proceed",
      validateVariant: "warning",
    });
    if (!confirmed) {
      return;
    }

    setIsJoiningSpaces(true);
    try {
      // The spaces are independent, so they are joined concurrently.
      await concurrentExecutor(
        missingSpaceIds,
        async (spaceId) => {
          const space = spaceById.get(spaceId);
          if (!space) {
            return;
          }
          await addSpaceMembers(space, [user.sId], {
            title: `Joined ${space.name}`,
            description: `You are now a member of ${space.name}.`,
          });
        },
        { concurrency: 4 }
      );
      void mutateAgentConfiguration();
    } finally {
      setIsJoiningSpaces(false);
    }
  };

  // Becoming an editor only helps for unpublished agents the admin does not edit yet. The step is
  // offered once every required space is joined, so the admin resolves one restriction at a time.
  const needsEditorAccess =
    agentConfiguration.scope !== "visible" && !agentConfiguration.canEdit;
  const showBecomeEditor = needsEditorAccess && missingSpaceIds.length === 0;

  return (
    <ContentMessage title="Restricted access" icon={Lock01} size="md">
      <div className="flex flex-col gap-2">
        <span>You cannot see the details of this agent.</span>
        {needsEditorAccess && (
          <span>
            The agent is not published and you are not one of its editors.
          </span>
        )}
        {missingSpaceNames.length > 0 && (
          <span>
            The agent uses restricted spaces you are not a member of:{" "}
            {missingSpaceNames.join(", ")}.
          </span>
        )}
        {missingSpaceNames.length > 0 && (
          <div>
            <Button
              variant="outline"
              size="sm"
              icon={UsersPlus}
              label={
                missingSpaceNames.length === 1
                  ? `Join space ${missingSpaceNames[0]}`
                  : "Join all required spaces"
              }
              isLoading={isJoiningSpaces}
              disabled={isJoiningSpaces}
              onClick={() => {
                void handleJoinSpaces();
              }}
              type="button"
            />
          </div>
        )}
        {showBecomeEditor && (
          <>
            <div>
              <BecomeEditorButton
                isLoading={isAddingSelfAsEditor}
                onClick={() => {
                  void handleAddSelfAsEditor();
                }}
              />
            </div>
          </>
        )}
      </div>
    </ContentMessage>
  );
}
