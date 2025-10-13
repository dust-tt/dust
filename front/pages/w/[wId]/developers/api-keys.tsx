import {
  BookOpenIcon,
  Button,
  Chip,
  ClipboardCheckIcon,
  ClipboardIcon,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  Input,
  Label,
  Page,
  PlusIcon,
  ShapesIcon,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Spinner,
  useCopyToClipboard,
} from "@dust-tt/sparkle";
import _ from "lodash";
import type { InferGetServerSidePropsType } from "next";
import React, { useMemo, useState } from "react";
import { useSWRConfig } from "swr";

import { subNavigationAdmin } from "@app/components/navigation/config";
import { AppCenteredLayout } from "@app/components/sparkle/AppCenteredLayout";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { useSendNotification } from "@app/hooks/useNotification";
import { useSubmitFunction } from "@app/lib/client/utils";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { GroupResource } from "@app/lib/resources/group_resource";
import { useKeys } from "@app/lib/swr/apps";
import { classNames, timeAgoFrom } from "@app/lib/utils";
import type {
  GroupType,
  KeyType,
  ModelId,
  SubscriptionType,
  UserType,
  WorkspaceType,
} from "@app/types";
import {
  AGENT_GROUP_PREFIX,
  GLOBAL_SPACE_NAME,
  SPACE_GROUP_PREFIX,
} from "@app/types";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  groups: GroupType[];
  user: UserType;
}>(async (context, auth) => {
  const owner = auth.getNonNullableWorkspace();
  const subscription = auth.getNonNullableSubscription();
  const user = auth.getNonNullableUser().toJSON();
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
  const [isCopiedWorkspaceId, copyWorkspaceId] = useCopyToClipboard();
  const [isCopiedName, copyName] = useCopyToClipboard();
  const [isCopiedDomain, copyDomain] = useCopyToClipboard();
  const [isCopiedApiKey, copyApiKey] = useCopyToClipboard();
  const [newApiKeyName, setNewApiKeyName] = useState("");
  const [newApiKeyRestrictedGroup, setNewApiKeyRestrictedGroup] =
    useState<GroupType | null>(null);
  const [isNewApiKeyCreatedOpen, setIsNewApiKeyCreatedOpen] = useState(false);

  const { isValidating, keys } = useKeys(owner);

  const groupsById = useMemo(() => {
    return groups.reduce<Record<ModelId, GroupType>>((acc, group) => {
      acc[group.id] = group;
      return acc;
    }, {});
  }, [groups]);

  const sendNotification = useSendNotification();

  const { submit: handleGenerate, isSubmitting: isGenerating } =
    useSubmitFunction(
      async ({ name, group }: { name: string; group: GroupType | null }) => {
        const globalGroup = groups.find((g) => g.kind === "global");
        const response = await fetch(`/api/w/${owner.sId}/keys`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name,
            group_id: group?.sId ? group.sId : globalGroup?.sId,
          }),
        });
        await mutate(`/api/w/${owner.sId}/keys`);
        setNewApiKeyName("");
        if (response.status >= 200 && response.status < 300) {
          setIsNewApiKeyCreatedOpen(true);
          sendNotification({
            title: "API Key Created",
            description:
              "Your API key will remain visible for 10 minutes only. You can use it to authenticate with the Dust API.",
            type: "success",
          });
          return;
        }
        const errorResponse = await response.json();
        sendNotification({
          title: "Error creating API key",
          description: _.get(errorResponse, "error.message", "Unknown error"),
          type: "error",
        });
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

  const prettifyGroupName = (group: GroupType) => {
    if (group.kind === "global") {
      return GLOBAL_SPACE_NAME;
    }

    return group.kind === "agent_editors"
      ? group.name.replace(AGENT_GROUP_PREFIX, "")
      : group.name.replace(SPACE_GROUP_PREFIX, "");
  };

  const getKeySpaces = (key: KeyType): string[] => {
    const group = groupsById[key.groupId];

    if (group.kind === "global" || key.scope == "restricted_group_only") {
      return [prettifyGroupName(group)];
    }

    return [GLOBAL_SPACE_NAME, prettifyGroupName(group)];
  };

  return (
    <>
      <Sheet
        open={isNewApiKeyCreatedOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsNewApiKeyCreatedOpen(false);
          }
        }}
      >
        <SheetContent>
          <SheetHeader>
            <SheetTitle>API Key Created</SheetTitle>
          </SheetHeader>
          <SheetContainer>
            <div className="mt-4">
              <p className="text-sm text-muted-foreground">
                Your API key will remain visible for 10 minutes only. You can
                use it to authenticate with the Dust API.
              </p>
              <br />
              <div className="mt-4">
                <Page.H variant="h5">Name</Page.H>
                <Page.Horizontal align="center">
                  <pre className="dd-privacy-mask flex-grow overflow-x-auto rounded bg-muted-background p-2 font-mono dark:bg-muted-background-night">
                    {keys[0]?.name}
                  </pre>
                  <IconButton
                    tooltip="Copy to clipboard"
                    icon={isCopiedName ? ClipboardCheckIcon : ClipboardIcon}
                    onClick={async () => {
                      if (keys[0]?.name) {
                        await copyName(keys[0].name);
                      }
                    }}
                  />
                </Page.Horizontal>
              </div>
              <div className="mt-4">
                <Page.H variant="h5">Domain</Page.H>
                <Page.Horizontal align="center">
                  <pre className="dd-privacy-mask flex-grow overflow-x-auto rounded bg-muted-background p-2 font-mono dark:bg-muted-background-night">
                    {process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL}
                  </pre>
                  <IconButton
                    tooltip="Copy to clipboard"
                    icon={isCopiedDomain ? ClipboardCheckIcon : ClipboardIcon}
                    onClick={async () => {
                      await copyDomain(
                        process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL ?? ""
                      );
                    }}
                  />
                </Page.Horizontal>
              </div>
              <div className="mt-4">
                <Page.H variant="h5">Workspace ID</Page.H>
                <Page.Horizontal align="center">
                  <pre className="dd-privacy-mask flex-grow overflow-x-auto rounded bg-muted-background p-2 font-mono dark:bg-muted-background-night">
                    {owner.sId}
                  </pre>
                  <IconButton
                    tooltip="Copy to clipboard"
                    icon={
                      isCopiedWorkspaceId ? ClipboardCheckIcon : ClipboardIcon
                    }
                    onClick={async () => {
                      await copyWorkspaceId(owner.sId);
                    }}
                  />
                </Page.Horizontal>
              </div>
              <div className="mt-4">
                <Page.H variant="h5">API Key</Page.H>
                <Page.Horizontal align="center">
                  <pre className="dd-privacy-mask flex-grow overflow-x-auto rounded bg-muted-background p-2 font-mono dark:bg-muted-background-night">
                    {keys[0]?.secret}
                  </pre>
                  <IconButton
                    tooltip="Copy to clipboard"
                    icon={isCopiedApiKey ? ClipboardCheckIcon : ClipboardIcon}
                    onClick={async () => {
                      if (keys[0]?.secret) {
                        await copyApiKey(keys[0].secret);
                      }
                    }}
                  />
                </Page.Horizontal>
              </div>
            </div>
          </SheetContainer>
        </SheetContent>
      </Sheet>
      <Page.Horizontal align="stretch">
        <div className="w-full" />
        <Button
          label="Read the API reference"
          size="sm"
          variant="outline"
          icon={BookOpenIcon}
          onClick={() => {
            window.open("https://docs.dust.tt/reference", "_blank");
          }}
        />
        <Dialog modal={false}>
          <DialogTrigger asChild>
            <Button
              label="Create API Key"
              icon={PlusIcon}
              disabled={isGenerating || isRevoking}
            />
          </DialogTrigger>
          <DialogContent size="md">
            <DialogHeader>
              <DialogTitle>New API Key</DialogTitle>
            </DialogHeader>
            <DialogContainer>
              <div className="space-y-4">
                <div>
                  <Label>API Key Name</Label>
                  <Input
                    name="API Key"
                    placeholder="Type an API key name"
                    value={newApiKeyName}
                    onChange={(e) => setNewApiKeyName(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Default Space</Label>
                  <div>
                    <Button
                      label={GLOBAL_SPACE_NAME}
                      size="sm"
                      variant="outline"
                      disabled={true}
                      tooltip={`${GLOBAL_SPACE_NAME} is mandatory.`}
                    />
                  </div>
                </div>
                <div>
                  <Label>Add optional additional Space</Label>
                  <div>
                    {newApiKeyRestrictedGroup ? (
                      <Chip
                        label={prettifyGroupName(newApiKeyRestrictedGroup)}
                        onRemove={() => setNewApiKeyRestrictedGroup(null)}
                        size="sm"
                      />
                    ) : (
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <Button
                            label={
                              newApiKeyRestrictedGroup
                                ? prettifyGroupName(newApiKeyRestrictedGroup)
                                : "Add a space"
                            }
                            size="sm"
                            variant="outline"
                            isSelect={newApiKeyRestrictedGroup === null}
                          />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          {groups
                            .filter((g) => g.kind !== "global")
                            .sort((a, b) => {
                              return prettifyGroupName(a)
                                .toLowerCase()
                                .localeCompare(
                                  prettifyGroupName(b).toLowerCase()
                                );
                            })
                            .map((group: GroupType) => (
                              <DropdownMenuItem
                                key={group.id}
                                label={prettifyGroupName(group)}
                                onClick={() =>
                                  setNewApiKeyRestrictedGroup(group)
                                }
                              />
                            ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              </div>
            </DialogContainer>
            <DialogFooter
              leftButtonProps={{
                label: "Cancel",
                variant: "outline",
              }}
              rightButtonProps={{
                label: "Create",
                variant: "primary",
                onClick: async () => {
                  await handleGenerate({
                    name: newApiKeyName,
                    group: newApiKeyRestrictedGroup,
                  });
                },
              }}
            />
          </DialogContent>
        </Dialog>
      </Page.Horizontal>
      <div className="space-y-4 divide-y divide-gray-200 dark:divide-gray-200-night">
        <ul role="list" className="pt-4">
          {_.sortBy(keys, (key) => key.status[0] + key.name) // Sort by status first (a for active and i for inactive), then by name
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
                        <div className="dd-privacy-mask">
                          <p
                            className={classNames(
                              "truncate font-mono text-sm",
                              "text-muted-foreground dark:text-muted-foreground-night"
                            )}
                          >
                            Name:{" "}
                            <strong>{key.name ? key.name : "Unnamed"}</strong>
                          </p>
                          <p
                            className={classNames(
                              "truncate font-mono text-sm",
                              "text-muted-foreground dark:text-muted-foreground-night"
                            )}
                          >
                            Domain:{" "}
                            <strong>
                              {process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL}
                            </strong>
                          </p>
                          <p
                            className={classNames(
                              "truncate font-mono text-sm",
                              "text-muted-foreground dark:text-muted-foreground-night"
                            )}
                          >
                            Scope:{" "}
                            <strong>{getKeySpaces(key).join(", ")}</strong>
                          </p>
                          <pre className="text-sm">{key.secret}</pre>
                          <p
                            className={classNames(
                              "front-normal text-xs",
                              "text-muted-foreground dark:text-muted-foreground-night"
                            )}
                          >
                            Created {key.creator ? `by ${key.creator} ` : ""}
                            {timeAgoFrom(key.createdAt, {
                              useLongFormat: true,
                            })}{" "}
                            ago.
                          </p>
                          <p
                            className={classNames(
                              "front-normal text-xs",
                              "text-muted-foreground dark:text-muted-foreground-night"
                            )}
                          >
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
                        variant="warning"
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
    <AppCenteredLayout
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
    </AppCenteredLayout>
  );
}

APIKeysPage.getLayout = (page: React.ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};
