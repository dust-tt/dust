import {
  BookOpenIcon,
  Button,
  Page,
  ShapesIcon,
  Spinner,
} from "@dust-tt/sparkle";
import _ from "lodash";
import type { ReactElement } from "react";
import React, { useMemo, useState } from "react";
import { useSWRConfig } from "swr";

import { subNavigationAdmin } from "@app/components/navigation/config";
import { AppAuthContextLayout } from "@app/components/sparkle/AppAuthContextLayout";
import { AppCenteredLayout } from "@app/components/sparkle/AppCenteredLayout";
import { APIKeyCreationSheet } from "@app/components/workspace/api-keys/APIKeyCreationSheet";
import { APIKeysList } from "@app/components/workspace/api-keys/APIKeysList";
import { NewAPIKeyDialog } from "@app/components/workspace/api-keys/NewAPIKeyDialog";
import { useSendNotification } from "@app/hooks/useNotification";
import type { AppPageWithLayout } from "@app/lib/app/serverSideProps";
import { appGetServerSidePropsForAdmin } from "@app/lib/app/serverSideProps";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { useSubmitFunction } from "@app/lib/client/utils";
import { clientFetch } from "@app/lib/egress/client";
import { useKeys } from "@app/lib/swr/apps";
import { useGroups } from "@app/lib/swr/groups";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type { GroupType, KeyType, ModelId, WorkspaceType } from "@app/types";

export const getServerSideProps = appGetServerSidePropsForAdmin;

export function APIKeys({ owner }: { owner: WorkspaceType }) {
  const { mutate } = useSWRConfig();
  const [isNewApiKeyCreatedOpen, setIsNewApiKeyCreatedOpen] = useState(false);

  const { isValidating, keys } = useKeys(owner);
  const { groups, isGroupsLoading } = useGroups({ owner });

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

  // Show a loading spinner while API keys or groups are being fetched.
  if (isValidating || isGroupsLoading) {
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

function APIKeysPage() {
  const owner = useWorkspace();
  const { subscription } = useAuth();

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
          <APIKeys owner={owner} />
        </Page.Vertical>
      </Page.Vertical>
      <div className="h-12" />
    </AppCenteredLayout>
  );
}

const PageWithAuthLayout = APIKeysPage as AppPageWithLayout;

PageWithAuthLayout.getLayout = (
  page: ReactElement,
  pageProps: AuthContextValue
) => {
  return (
    <AppAuthContextLayout authContext={pageProps}>{page}</AppAuthContextLayout>
  );
};

export default PageWithAuthLayout;
