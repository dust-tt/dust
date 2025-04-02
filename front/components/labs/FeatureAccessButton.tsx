import { Button, Cog6ToothIcon } from "@dust-tt/sparkle";
import { useRouter } from "next/router";

import { RequestFeatureAccessModal } from "@app/components/labs/RequestFeatureAccessModal";
import type { WorkspaceType } from "@app/types";
interface FeatureAccessButtonProps {
  accessible: boolean;
  featureName: string;
  managePath: string;
  owner: WorkspaceType;
}

export function FeatureAccessButton({
  accessible,
  featureName,
  managePath,
  owner,
}: FeatureAccessButtonProps) {
  const router = useRouter();

  return (
    <>
      {accessible ? (
        <Button
          variant="outline"
          label="Manage"
          size="sm"
          icon={Cog6ToothIcon}
          onClick={() => router.push(managePath)}
        />
      ) : (
        <RequestFeatureAccessModal owner={owner} featureName={featureName} />
      )}
    </>
  );
}
