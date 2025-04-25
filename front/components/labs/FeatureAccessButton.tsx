import { Button, Cog6ToothIcon, LockIcon } from "@dust-tt/sparkle";

import { ConfigureLabsConnectionModal } from "@app/components/labs/modals/ConfigureLabsConnectionModal";
import type { LabsConnectionsConfigurationResource } from "@app/lib/resources/labs_connections_resource";
import type {
  DataSourceViewType,
  LabsConnectionItemType,
  LightWorkspaceType,
  SpaceType,
} from "@app/types";

import { RequestFeatureAccessModal } from "./modals/RequestFeatureAccessModal";

interface FeatureAccessButtonProps {
  accessible: boolean;
  featureName: string;
  managePath?: string;
  owner: LightWorkspaceType;
  canRequestAccess: boolean;
  canManage: boolean;
  connection?: LabsConnectionItemType;
  dataSourcesViews?: DataSourceViewType[];
  spaces?: SpaceType[];
  isSpacesLoading?: boolean;
  existingConfigurations?: LabsConnectionsConfigurationResource[];
}

export function FeatureAccessButton({
  accessible,
  featureName,
  managePath,
  owner,
  canRequestAccess,
  canManage,
  connection,
  dataSourcesViews = [],
  spaces = [],
  isSpacesLoading = false,
  existingConfigurations = [],
}: FeatureAccessButtonProps) {
  if (!accessible) {
    return (
      <RequestFeatureAccessModal
        featureName={featureName}
        owner={owner}
        canRequestAccess={canRequestAccess}
      />
    );
  }

  if (connection) {
    const existingConfiguration = existingConfigurations.find(
      (config) => config.provider === connection.id
    );

    return (
      <ConfigureLabsConnectionModal
        owner={owner}
        connection={connection}
        dataSourcesViews={dataSourcesViews}
        spaces={spaces}
        isSpacesLoading={isSpacesLoading}
        existingConfiguration={existingConfiguration}
      />
    );
  }

  if (!canManage) {
    return (
      <Button
        disabled={true}
        icon={LockIcon}
        label="Manage"
        variant="outline"
      />
    );
  }
  return (
    <Button
      href={managePath}
      icon={Cog6ToothIcon}
      label="Manage"
      variant="outline"
    />
  );
}
