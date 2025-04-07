import { Button, Cog6ToothIcon } from "@dust-tt/sparkle";

import { ConfigureLabsConnectionModal } from "@app/components/labs/modals/ConfigureLabsConnectionModal";
import type { LabsConnectionItemType, LightWorkspaceType } from "@app/types";

import { RequestFeatureAccessModal } from "./modals/RequestFeatureAccessModal";

interface FeatureAccessButtonProps {
  accessible: boolean;
  featureName: string;
  managePath?: string;
  owner: LightWorkspaceType;
  canRequestAccess: boolean;
  connection?: LabsConnectionItemType;
}

export function FeatureAccessButton({
  accessible,
  featureName,
  managePath,
  owner,
  canRequestAccess,
  connection,
}: FeatureAccessButtonProps) {
  return (
    <>
      {accessible ? (
        <>
          {managePath && (
            <Button
              variant="outline"
              label="Manage"
              size="sm"
              icon={Cog6ToothIcon}
              href={managePath}
            />
          )}
          {connection && (
            <ConfigureLabsConnectionModal
              owner={owner}
              connection={connection}
            />
          )}
        </>
      ) : (
        <RequestFeatureAccessModal
          owner={owner}
          featureName={featureName}
          canRequestAccess={canRequestAccess}
        />
      )}
    </>
  );
}
