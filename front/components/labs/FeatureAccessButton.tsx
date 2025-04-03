import { Button, Cog6ToothIcon } from "@dust-tt/sparkle";

import { RequestFeatureAccessModal } from "@app/components/labs/RequestFeatureAccessModal";
import type { LightWorkspaceType } from "@app/types";
interface FeatureAccessButtonProps {
  accessible: boolean;
  featureName: string;
  managePath: string;
  owner: LightWorkspaceType;
}

export function FeatureAccessButton({
  accessible,
  featureName,
  managePath,
  owner,
}: FeatureAccessButtonProps) {
  return (
    <>
      {accessible ? (
        <Button
          variant="outline"
          label="Manage"
          size="sm"
          icon={Cog6ToothIcon}
          href={managePath}
        />
      ) : (
        <RequestFeatureAccessModal owner={owner} featureName={featureName} />
      )}
    </>
  );
}
