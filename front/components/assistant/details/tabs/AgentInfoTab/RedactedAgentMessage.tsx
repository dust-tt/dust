import { ConfirmContext } from "@app/components/Confirm";
import { BecomeEditorButton } from "@app/components/shared/BecomeEditorButton";
import { useSendNotification } from "@app/hooks/useNotification";
import { useAuth } from "@app/lib/auth/AuthContext";
import { clientFetch } from "@app/lib/egress/client";
import { useUpdateEditors } from "@app/lib/swr/agent_editors";
import { useAgentConfiguration } from "@app/lib/swr/assistants";
import {
  useSpaces,
  useSpacesAsAdmin,
  useUpdateSpace,
} from "@app/lib/swr/spaces";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { GetSpaceResponseBody } from "@app/types/api/spaces";
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

  // Same flow as the agent builder's "Become an editor": the editors update refetches the agent,
  // which comes back unredacted once the caller is an editor.
  const handleAddSelfAsEditor = async () => {
    if (isAddingSelfAsEditor) {
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

  const confirm = useContext(ConfirmContext);
  const sendNotification = useSendNotification();
  const updateSpace = useUpdateSpace({ owner });
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
        "You are modifying this space's settings while not being a member yourself. " +
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
          const res = await clientFetch(
            `/api/w/${owner.sId}/spaces/${space.sId}`
          );
          if (!res.ok) {
            sendNotification({
              type: "error",
              title: `Failed to join ${space.name}`,
              description: "The space could not be loaded.",
            });
            return;
          }
          const { space: spaceInfo }: GetSpaceResponseBody = await res.json();
          if (spaceInfo.managementMode !== "manual") {
            sendNotification({
              type: "error",
              title: `Cannot join ${space.name}`,
              description:
                "Its members are managed by groups. Add yourself to one of its groups instead.",
            });
            return;
          }
          await updateSpace(
            space,
            {
              name: spaceInfo.name,
              isRestricted: spaceInfo.isRestricted,
              managementMode: "manual",
              memberIds: [
                ...spaceInfo.members
                  .filter((m) => !m.isEditor)
                  .map((m) => m.sId),
                user.sId,
              ],
              editorIds: spaceInfo.members
                .filter((m) => m.isEditor)
                .map((m) => m.sId),
            },
            {
              title: `Joined ${space.name}`,
              description: `You are now a member of ${space.name}.`,
            }
          );
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
    <ContentMessage title="Not Available" icon={Lock01} size="md">
      <div className="flex flex-col gap-2">
        <span>
          You cannot see agent details of this agent, even as an admin.
        </span>
        <ul className="list-disc pl-4">
          {needsEditorAccess && (
            <li>
              The agent is not published and you are not one of its editors.
            </li>
          )}
          {missingSpaceNames.length > 0 && (
            <li>
              The agent uses restricted spaces you are not a member of:{" "}
              {missingSpaceNames.join(", ")}.
            </li>
          )}
        </ul>
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
