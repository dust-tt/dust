import { Button, Cog6ToothIcon } from "@dust-tt/sparkle";
import type { KeyedMutator } from "swr";

import { ConfigureLabsConnectionModal } from "@app/components/labs/modals/ConfigureLabsConnectionModal";
import type { LabsConnectionsConfigurationResource } from "@app/lib/resources/labs_connections_resource";
import type { LabsConnectionItemType, LightWorkspaceType } from "@app/types";

import { RequestFeatureAccessModal } from "./modals/RequestFeatureAccessModal";

interface FeatureAccessButtonProps {
  accessible: boolean;
  featureName: string;
  managePath?: string;
  owner: LightWorkspaceType;
  canRequestAccess: boolean;
  connection?: LabsConnectionItemType;
  dataSourcesViews?: any[];
  spaces?: any[];
  isSpacesLoading?: boolean;
  existingConfigurations?: LabsConnectionsConfigurationResource[];
}

export function FeatureAccessButton({
  accessible,
  featureName,
  managePath,
  owner,
  canRequestAccess,
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

  return (
    <Button
      label="Manage"
      icon={Cog6ToothIcon}
      variant="outline"
      href={managePath}
    />
  );
}
