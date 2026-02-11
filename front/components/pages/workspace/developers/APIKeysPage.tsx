import {
  BookOpenIcon,
  Button,
  Page,
  ShapesIcon,
  Spinner,
} from "@dust-tt/sparkle";
import get from "lodash/get";
import { useMemo, useState } from "react";
import { useSWRConfig } from "swr";

import { APIKeyCreationSheet } from "@app/components/workspace/api-keys/APIKeyCreationSheet";
import { APIKeysList } from "@app/components/workspace/api-keys/APIKeysList";
import { EditKeyCapDialog } from "@app/components/workspace/api-keys/EditKeyCapDialog";
import { NewAPIKeyDialog } from "@app/components/workspace/api-keys/NewAPIKeyDialog";
import { useSendNotification } from "@app/hooks/useNotification";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { useSubmitFunction } from "@app/lib/client/utils";
import { clientFetch } from "@app/lib/egress/client";
import { useKeys } from "@app/lib/swr/apps";
import { useGroups } from "@app/lib/swr/groups";
import type { GroupType } from "@app/types/groups";
import type { KeyType } from "@app/types/key";
import type { ModelId } from "@app/types/shared/model_id";
import type { WorkspaceType } from "@app/types/user";

interface APIKeysProps {
  owner: WorkspaceType;
}

export function APIKeys({ owner }: APIKeysProps) {
  const { mutate } = useSWRConfig();
  const [isNewApiKeyCreatedOpen, setIsNewApiKeyCreatedOpen] = useState(false);
  const [editCapKey, setEditCapKey] = useState<KeyType | null>(null);

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
      async ({
        name,
        group,
        monthlyCapMicroUsd,
      }: {
        name: string;
        group: GroupType | null;
        monthlyCapMicroUsd: number | null;
      }) => {
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
            monthly_cap_micro_usd: monthlyCapMicroUsd,
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
          description: get(errorResponse, "error.message", "Unknown error"),
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

  const { submit: handleUpdateCap, isSubmitting: isUpdatingCap } =
    useSubmitFunction(async (monthlyCapMicroUsd: number | null) => {
      if (!editCapKey) {
        return;
      }
      const response = await clientFetch(
        `/api/w/${owner.sId}/keys/${editCapKey.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ monthly_cap_micro_usd: monthlyCapMicroUsd }),
        }
      );
      await mutate(`/api/w/${owner.sId}/keys`);
      if (response.ok) {
        sendNotification({
          title: "Monthly cap updated",
          type: "success",
        });
        setEditCapKey(null);
      } else {
        const errorResponse = await response.json();
        sendNotification({
          title: "Error updating monthly cap",
          description: get(errorResponse, "error.message", "Unknown error"),
          type: "error",
        });
      }
    });

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
        onEditCap={setEditCapKey}
      />
      {editCapKey && (
        <EditKeyCapDialog
          keyData={editCapKey}
          isOpen={!!editCapKey}
          onClose={() => setEditCapKey(null)}
          onSave={handleUpdateCap}
          isSaving={isUpdatingCap}
        />
      )}
    </>
  );
}

export function APIKeysPage() {
  const owner = useWorkspace();

  return (
    <>
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
    </>
  );
}
