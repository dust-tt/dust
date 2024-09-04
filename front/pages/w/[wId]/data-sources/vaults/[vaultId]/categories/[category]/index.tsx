import { Page } from "@dust-tt/sparkle";
import type {
  DataSourceViewCategory,
  PlanType,
  VaultType,
  WorkspaceType,
} from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import { useContext } from "react";

import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { VaultAppsList } from "@app/components/vaults/VaultAppsList";
import type { VaultLayoutProps } from "@app/components/vaults/VaultLayout";
import { VaultLayout } from "@app/components/vaults/VaultLayout";
import { VaultResourcesList } from "@app/components/vaults/VaultResourcesList";
import config from "@app/lib/api/config";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { VaultResource } from "@app/lib/resources/vault_resource";

export const getServerSideProps = withDefaultUserAuthRequirements<
  VaultLayoutProps & {
    category: DataSourceViewCategory;
    dustClientFacingUrl: string;
    isAdmin: boolean;
    isBuilder: boolean;
    vault: VaultType;
    systemVault: VaultType;
    plan: PlanType;
  }
>(async (context, auth) => {
  const owner = auth.getNonNullableWorkspace();
  const subscription = auth.subscription();
  const plan = auth.plan();

  if (!subscription || !plan) {
    return {
      notFound: true,
    };
  }

  const systemVault = await VaultResource.fetchWorkspaceSystemVault(auth);
  const vault = await VaultResource.fetchById(
    auth,
    context.query.vaultId as string
  );
  if (!vault || !systemVault) {
    return {
      notFound: true,
    };
  }
  const isAdmin = auth.isAdmin();
  const isBuilder = auth.isBuilder();

  return {
    props: {
      category: context.query.category as DataSourceViewCategory,
      dustClientFacingUrl: config.getClientFacingUrl(),
      gaTrackingId: config.getGaTrackingId(),
      isAdmin,
      isBuilder,
      owner,
      plan,
      subscription,
      vault: vault.toJSON(),
      systemVault: systemVault.toJSON(),
    },
  };
});

const fetchWebsiteRootUrl = async (
  owner: WorkspaceType,
  vault: VaultType,
  category: string,
  sId: string
): Promise<string | null> => {
  const body = JSON.stringify({
    internalIds: [null],
    includeChildren: true,
    viewType: "documents",
  });

  try {
    const res = await fetch(
      `/api/w/${owner.sId}/vaults/${vault.sId}/data_source_views/${sId}/content-nodes`,
      {
        method: "POST",
        body,
        headers: { "Content-Type": "application/json" },
      }
    );

    if (!res.ok) {
      throw new Error("Failed to fetch content nodes");
    }

    const json = await res.json();
    const nodes = json.nodes;

    if (!nodes || nodes.length() !== 1) {
      console.error("Error in fetched nodes.");
      return null;
    }
    const rootNodeInternalId = nodes[0].internalId;
    return `/w/${owner.sId}/data-sources/vaults/${vault.sId}/categories/${category}/data_source_views/${sId}?parentId=${rootNodeInternalId}`;
  } catch (error) {
    console.error("Error fetching vault resource content URL:", error);
    return null;
  }
};

export default function Vault({
  category,
  dustClientFacingUrl,
  isAdmin,
  isBuilder,
  owner,
  plan,
  vault,
  systemVault,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const sendNotification = useContext(SendNotificationsContext);

  const handleSelect = async (sId: string) => {
    switch (category) {
      case "apps": {
        await router.push(`/w/${owner.sId}/a/${sId}`);
        break;
      }
      case "website": {
        // for websites we want to skip the root node and directly redirect to
        // the next depth level
        const url = await fetchWebsiteRootUrl(owner, vault, category, sId);
        if (url) {
          await router.push(url);
        } else {
          sendNotification({
            title: "Error retrieving website",
            description:
              "An error occurred while retrieving the website's content.",
            type: "error",
          });
        }
        break;
      }
      case "managed":
      case "folder": {
        void router.push(
          `/w/${owner.sId}/data-sources/vaults/${vault.sId}/categories/${category}/data_source_views/${sId}`
        );
      }
    }
  };

  return (
    <Page.Vertical gap="xl" align="stretch">
      {category === "apps" ? (
        <VaultAppsList
          owner={owner}
          isBuilder={isBuilder}
          onSelect={(sId) => {
            void router.push(`/w/${owner.sId}/a/${sId}`);
          }}
        />
      ) : (
        <VaultResourcesList
          dustClientFacingUrl={dustClientFacingUrl}
          owner={owner}
          plan={plan}
          vault={vault}
          systemVault={systemVault}
          isAdmin={isAdmin}
          category={category}
          onSelect={handleSelect}
        />
      )}
    </Page.Vertical>
  );
}

Vault.getLayout = (page: ReactElement, pageProps: any) => {
  return <VaultLayout pageProps={pageProps}>{page}</VaultLayout>;
};
