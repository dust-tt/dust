import {
  BookOpenIcon,
  Button,
  ClipboardIcon,
  Dialog,
  DropdownMenu,
  IconButton,
  Input,
  Modal,
  Page,
  PlusIcon,
  ShapesIcon,
  Spinner,
} from "@dust-tt/sparkle";
import type {
  GroupType,
  KeyType,
  ModelId,
  SubscriptionType,
  UserType,
  WorkspaceType,
} from "@dust-tt/types";
import { prettifyGroupName } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import React, { useMemo } from "react";
import { useState } from "react";
import { useSWRConfig } from "swr";

import { subNavigationAdmin } from "@app/components/navigation/config";
import AppLayout from "@app/components/sparkle/AppLayout";
import { useSubmitFunction } from "@app/lib/client/utils";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { GroupResource } from "@app/lib/resources/group_resource";
import { useKeys } from "@app/lib/swr/apps";
import { classNames, timeAgoFrom } from "@app/lib/utils";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  groups: GroupType[];
  user: UserType;
}>(async (context, auth) => {
  const owner = auth.getNonNullableWorkspace();
  const subscription = auth.getNonNullableSubscription();
  const user = auth.getNonNullableUser();
  if (!auth.isAdmin()) {
    return {
      notFound: true,
    };
  }

  // Creating a key is an admin task, so return all groups for selection.
  const groups = await GroupResource.listAllWorkspaceGroups(auth);

  return {
    props: {
      owner,
      groups: groups.map((group) => group.toJSON()),
      subscription,
      user,
    },
  };
});

export function APIKeys({
  owner,
  groups,
}: {
  owner: WorkspaceType;
  groups: GroupType[];
}) {
  const { mutate } = useSWRConfig();
  const [newApiKeyName, setNewApiKeyName] = useState("");
  const [newApiKeyGroup, setNewApiKeyGroup] = useState<GroupType>(groups[0]);
  const [isNewApiKeyPromptOpen, setIsNewApiKeyPromptOpen] = useState(false);
  const [isNewApiKeyCreatedOpen, setIsNewApiKeyCreatedOpen] = useState(false);

  const { isValidating, keys } = useKeys(owner);

  const groupsById = useMemo(() => {
    return groups.reduce<Record<ModelId, GroupType>>((acc, group) => {
      acc[group.id] = group;
      return acc;
    }, {});
  }, [groups]);

  const { submit: handleGenerate, isSubmitting: isGenerating } =
    useSubmitFunction(
      async ({ name, group }: { name: string; group?: GroupType }) => {
        await fetch(`/api/w/${owner.sId}/keys`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name, group_id: group?.sId }),
        });
        await mutate(`/api/w/${owner.sId}/keys`);
        setIsNewApiKeyPromptOpen(false);
        setNewApiKeyName("");
        setIsNewApiKeyCreatedOpen(true);
      }
    );

  const { submit: handleRevoke, isSubmitting: isRevoking } = useSubmitFunction(
    async (key: KeyType) => {
      await fetch(`/api/w/${owner.sId}/keys/${key.id}/disable`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      await mutate(`/api/w/${owner.sId}/keys`);
    }
  );

  // Show a loading spinner while API keys are being fetched or refreshed.
  if (isValidating) {
    return <Spinner />;
  }

  return (
    <>
      <Modal
        isOpen={isNewApiKeyCreatedOpen}
        title="API Key Created"
        onClose={() => {
          setIsNewApiKeyCreatedOpen(false);
        }}
        hasChanged={false}
      >
        <div className="mt-4">
          <p className="text-sm text-gray-700">
            Your API key will remain visible for 10 minutes only. <br />
            You can use it to authenticate with the Dust API. <br />
          </p>
          <br />
          <div className="mt-4">
            <Page.H variant="h5">Workspace ID</Page.H>
            <Page.Horizontal align="stretch">
              <pre>{owner.sId}</pre>
              <IconButton
                tooltip="Copy to clipboard"
                icon={ClipboardIcon}
                onClick={() => {
                  void navigator.clipboard.writeText(owner.sId);
                }}
              />
            </Page.Horizontal>
          </div>
          <div className="mt-4">
            <Page.H variant="h5">API Key</Page.H>
            <Page.Horizontal align="stretch">
              <pre>{keys[0]?.secret}</pre>
              <IconButton
                tooltip="Copy to clipboard"
                icon={ClipboardIcon}
                onClick={() => {
                  void navigator.clipboard.writeText(keys[0]?.secret);
                }}
              />
            </Page.Horizontal>
          </div>
        </div>
      </Modal>

      <Dialog
        isOpen={isNewApiKeyPromptOpen}
        title="New API Key"
        onValidate={() =>
          handleGenerate({ name: newApiKeyName, group: newApiKeyGroup })
        }
        onCancel={() => setIsNewApiKeyPromptOpen(false)}
      >
        <Input
          name="API Key"
          placeholder="Type an API key name"
          value={newApiKeyName}
          onChange={(e) => setNewApiKeyName(e.target.value)}
        />
        <div className="align-center flex flex-row items-center gap-2 p-2">
          <span className="mr-1 flex flex-initial text-sm font-medium leading-8 text-gray-700">
            Assign permissions to vault:{" "}
          </span>
          <DropdownMenu>
            <DropdownMenu.Button
              type="select"
              label={prettifyGroupName(newApiKeyGroup)}
            />
            <DropdownMenu.Items width={220}>
              {groups.map((group: GroupType) => (
                <DropdownMenu.Item
                  key={group.id}
                  label={prettifyGroupName(group)}
                  onClick={() => setNewApiKeyGroup(group)}
                />
              ))}
            </DropdownMenu.Items>
          </DropdownMenu>
        </div>
      </Dialog>
      <Page.Horizontal align="stretch">
        <div className="w-full" />
        <Button
          label="Read the API reference"
          size="sm"
          variant="secondary"
          icon={BookOpenIcon}
          onClick={() => {
            window.open("https://docs.dust.tt/reference", "_blank");
          }}
        />
        <Button
          label="Create API Key"
          icon={PlusIcon}
          disabled={isGenerating || isRevoking}
          onClick={() => setIsNewApiKeyPromptOpen(true)}
        />
      </Page.Horizontal>
      <div className="space-y-4 divide-y divide-gray-200">
        <ul role="list" className="pt-4">
          {keys
            .sort((a, b) => (b.status === "active" ? 1 : -1))
            .map((key) => (
              <li key={key.secret} className="px-2 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="flex flex-col">
                      <div className="flex flex-row">
                        <div className="my-auto mr-2 mt-0.5 flex flex-shrink-0">
                          <p
                            className={classNames(
                              "mb-0.5 inline-flex rounded-full px-2 text-xs font-semibold leading-5",
                              key.status === "active"
                                ? "bg-green-100 text-green-800"
                                : "bg-gray-100 text-gray-800"
                            )}
                          >
                            {key.status === "active" ? "active" : "revoked"}
                          </p>
                        </div>
                        <div>
                          <p
                            className={classNames(
                              "font-mono truncate text-sm text-slate-700"
                            )}
                          >
                            Name:{" "}
                            <strong>{key.name ? key.name : "Unnamed"}</strong>
                          </p>
                          {key.groupId && (
                            <p
                              className={classNames(
                                "font-mono truncate text-sm text-slate-700"
                              )}
                            >
                              Scoped to vault:{" "}
                              <strong>
                                {prettifyGroupName(groupsById[key.groupId])}
                              </strong>
                            </p>
                          )}
                          <pre className="text-sm">{key.secret}</pre>
                          <p className="front-normal text-xs text-element-700">
                            Created {key.creator ? `by ${key.creator} ` : ""}
                            {timeAgoFrom(key.createdAt, {
                              useLongFormat: true,
                            })}{" "}
                            ago.
                          </p>
                          <p className="front-normal text-xs text-element-700">
                            {key.lastUsedAt ? (
                              <>
                                Last used&nbsp;
                                {timeAgoFrom(key.lastUsedAt, {
                                  useLongFormat: true,
                                })}{" "}
                                ago.
                              </>
                            ) : (
                              <>Never used</>
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                  {key.status === "active" ? (
                    <div>
                      <Button
                        variant="secondaryWarning"
                        disabled={
                          key.status != "active" || isRevoking || isGenerating
                        }
                        onClick={async () => {
                          await handleRevoke(key);
                        }}
                        label="Revoke"
                      />
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
        </ul>
      </div>
    </>
  );
}

export default function APIKeysPage({
  owner,
  subscription,
  groups,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <AppLayout
      subscription={subscription}
      owner={owner}
      subNavigation={subNavigationAdmin({ owner, current: "api_keys" })}
    >
      <Page.Vertical gap="xl" align="stretch">
        <Page.Header
          title="API Keys"
          icon={ShapesIcon}
          description="API Keys allow you to securely connect to Dust from other applications and work with your data programmatically."
        />
        <Page.Vertical align="stretch" gap="md">
          <APIKeys owner={owner} groups={groups} />
        </Page.Vertical>
      </Page.Vertical>
      <div className="h-12" />
    </AppLayout>
  );
}
