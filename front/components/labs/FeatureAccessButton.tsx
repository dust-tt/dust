import { Button, Cog6ToothIcon, LockIcon } from "@dust-tt/sparkle";

import type {
  DataSourceViewType,
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
  dataSourcesViews?: DataSourceViewType[];
  spaces?: SpaceType[];
  isSpacesLoading?: boolean;
}

export function FeatureAccessButton({
  accessible,
  featureName,
  managePath,
  owner,
  canRequestAccess,
  canManage,
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

  if (!canManage) {
    return (
      <Button
        label="Manage"
        tooltip="Only admins can manage this feature."
        icon={LockIcon}
        variant="outline"
        disabled={true}
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
