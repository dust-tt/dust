import { Button, FolderIcon, Item, LockIcon, Tree } from "@dust-tt/sparkle";
import type {
  DataSourceOrViewInfo,
  VaultType,
  WorkspaceType,
} from "@dust-tt/types";
import { DATA_SOURCE_OR_VIEW_CATEGORIES } from "@dust-tt/types";
import { useRouter } from "next/router";
import type { SVGProps } from "react";
import * as React from "react";
import type { ReactElement } from "react-markdown/lib/react-markdown";

import { CATEGORY_DETAILS } from "@app/components/vaults/VaultCategoriesList";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import {
  useVaultDataSourceOrViews,
  useVaultInfo,
  useVaults,
} from "@app/lib/swr";

// Move to sparkle
export const CompanyIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      d="M19.1668 16.4998H16.6668V0.666504H3.3335V16.4998H0.833496V18.1665H19.1668V16.4998ZM6.66683 3.99984H9.16683V5.6665H6.66683V3.99984ZM6.66683 7.33317H9.16683V8.99984H6.66683V7.33317ZM6.66683 10.6665H9.16683V12.3332H6.66683V10.6665ZM10.8335 10.6665H13.3335V12.3332H10.8335V10.6665ZM10.8335 7.33317H13.3335V8.99984H10.8335V7.33317ZM10.8335 3.99984H13.3335V5.6665H10.8335V3.99984ZM10.0002 13.9998H13.3335V16.4998H10.0002V13.9998ZM6.66683 13.9998H8.3335V16.4998H6.66683V13.9998Z"
      fill="currentColor"
    />
  </svg>
);

interface DataSourceNavigationTree {
  owner: WorkspaceType;
}

const VaultDataSourceOrViewsItem = ({
  owner,
  vault,
  resource,
}: {
  owner: WorkspaceType;
  vault: VaultType;
  resource: DataSourceOrViewInfo;
}): ReactElement => {
  const router = useRouter();
  const Logo = resource.connectorProvider
    ? CONNECTOR_CONFIGURATIONS[resource.connectorProvider].logoComponent
    : FolderIcon;
  return (
    <Tree.Item
      type="leaf"
      onItemClick={() => {
        void router.push(
          `/w/${owner.sId}/vaults/${vault.sId}/${CATEGORY_DETAILS[resource.category].dataSourceOrView}/${resource.sId}`
        );
      }}
      label={
        resource.connectorProvider
          ? CONNECTOR_CONFIGURATIONS[resource.connectorProvider].name
          : resource.name
      }
      visual={<Logo className="text-element-500" />}
      areActionsFading={false}
    ></Tree.Item>
  );
};

const VaultCategoryItem = ({
  owner,
  vault,
  category,
}: {
  owner: WorkspaceType;
  vault: VaultType;
  category: string;
}) => {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const router = useRouter();
  const categoryDetails = CATEGORY_DETAILS[category];
  const { vaultDataSourceOrViews } = useVaultDataSourceOrViews({
    workspaceId: owner.sId,
    vaultId: vault.sId,
    category,
    type: categoryDetails.dataSourceOrView,
    disabled: !isExpanded,
  });

  return (
    <Tree.Item
      label={categoryDetails.label}
      collapsed={!isExpanded}
      onItemClick={() => {
        void router.push(
          `/w/${owner.sId}/vaults/${vault.sId}/resources/${category}`
        );
      }}
      onChevronClick={() => setIsExpanded(!isExpanded)}
      visual={categoryDetails.icon}
      areActionsFading={false}
    >
      {isExpanded && (
        <Tree>
          {vaultDataSourceOrViews &&
            vaultDataSourceOrViews.map((ds) => (
              <VaultDataSourceOrViewsItem
                key={ds.sId}
                owner={owner}
                vault={vault}
                resource={ds}
              />
            ))}
        </Tree>
      )}
    </Tree.Item>
  );
};

const VaultItem = ({
  owner,
  vault,
}: {
  owner: WorkspaceType;
  vault: VaultType;
}) => {
  const router = useRouter();

  const [isExpanded, setIsExpanded] = React.useState(false);

  const { vaultInfo } = useVaultInfo({
    workspaceId: owner.sId,
    vaultId: vault.sId,
    disabled: !isExpanded,
  });

  return (
    <Tree.Item
      label={vault.name}
      collapsed={!isExpanded}
      onItemClick={() => {
        void router.push(`/w/${owner.sId}/vaults/${vault.sId}`);
      }}
      onChevronClick={() => setIsExpanded(!isExpanded)}
      visual={
        vault.kind === "global" ? (
          <CompanyIcon className="text-emerald-500" />
        ) : (
          <LockIcon className="text-emerald-500" />
        )
      }
      size="md"
      areActionsFading={false}
    >
      {isExpanded && (
        <Tree>
          {vaultInfo?.categories &&
            DATA_SOURCE_OR_VIEW_CATEGORIES.map(
              (c) =>
                vaultInfo.categories[c] && (
                  <VaultCategoryItem
                    key={c}
                    category={c}
                    owner={owner}
                    vault={vault}
                  />
                )
            )}
        </Tree>
      )}
    </Tree.Item>
  );
};

export const DataSourceNavigationTree = ({
  owner,
}: DataSourceNavigationTree) => {
  const { vaults } = useVaults({ workspaceId: owner.sId });

  return (
    <div className="p-3">
      <Item.List className="s-w-full">
        <Item.SectionHeader label="Shared" />
        <Tree>
          {vaults &&
            vaults
              .filter((vault) => vault.kind === "global")
              .map((vault) => (
                <VaultItem key={vault.sId} vault={vault} owner={owner} />
              ))}
        </Tree>
        <div className="flex items-center justify-between">
          <Item.SectionHeader label="Private" />
          <Button
            className="mt-4"
            size="xs"
            variant="tertiary"
            label="Create Vault "
            icon={LockIcon}
          />
        </div>

        <Tree>
          {vaults &&
            vaults
              .filter((vault) => vault.kind === "regular")
              .map((vault) => (
                <VaultItem key={vault.sId} vault={vault} owner={owner} />
              ))}
        </Tree>
      </Item.List>
    </div>
  );
};
