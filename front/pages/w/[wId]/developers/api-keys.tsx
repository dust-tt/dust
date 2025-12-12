import {
  BookOpenIcon,
  Button,
  Page,
  ShapesIcon,
  Spinner,
} from "@dust-tt/sparkle";
import _ from "lodash";
import type { InferGetServerSidePropsType } from "next";
import React, { useMemo, useState } from "react";
import { useSWRConfig } from "swr";

import { subNavigationAdmin } from "@app/components/navigation/config";
import { AppCenteredLayout } from "@app/components/sparkle/AppCenteredLayout";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { APIKeyCreationSheet } from "@app/components/workspace/api-keys/APIKeyCreationSheet";
import { APIKeysList } from "@app/components/workspace/api-keys/APIKeysList";
import { NewAPIKeyDialog } from "@app/components/workspace/api-keys/NewAPIKeyDialog";
import { useSendNotification } from "@app/hooks/useNotification";
import { useSubmitFunction } from "@app/lib/client/utils";
import { clientFetch } from "@app/lib/egress/client";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { GroupResource } from "@app/lib/resources/group_resource";
import { useKeys } from "@app/lib/swr/apps";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type {
  GroupType,
  KeyType,
  ModelId,
  SubscriptionType,
  UserType,
  WorkspaceType,
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
        const response = await clientFetch(`/api/w/${owner.sId}/keys`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name,
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            group_id: group?.sId ? group.sId : globalGroup?.sId,
          }),
        });
        await mutate(`/api/w/${owner.sId}/keys`);
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
      await clientFetch(`/api/w/${owner.sId}/keys/${key.id}/disable`, {
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
      <APIKeyCreationSheet
        isOpen={isNewApiKeyCreatedOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsNewApiKeyCreatedOpen(false);
          }
        }}
        latestKey={keys[0]}
        workspace={owner}
      />
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
        <NewAPIKeyDialog
          groups={groups}
          isGenerating={isGenerating}
          isRevoking={isRevoking}
          onCreate={handleGenerate}
        />
      </Page.Horizontal>
      <APIKeysList
        keys={keys}
        groupsById={groupsById}
        isRevoking={isRevoking}
        isGenerating={isGenerating}
        onRevoke={handleRevoke}
      />
    </>
  );
}

export default function APIKeysPage({
  owner,
  subscription,
  groups,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { featureFlags } = useFeatureFlags({ workspaceId: owner.sId });

  return (
    <AppCenteredLayout
      subscription={subscription}
      owner={owner}
      subNavigation={subNavigationAdmin({
        owner,
        current: "api_keys",
        featureFlags,
      })}
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
