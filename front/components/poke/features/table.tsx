import type { WhitelistableFeature, WorkspaceType } from "@dust-tt/types";
import { useRouter } from "next/router";
import { useContext } from "react";

import { makeColumnsForFeatureFlags } from "@app/components/poke/features/columns";
import { DataTable } from "@app/components/poke/shadcn/ui/data_table";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";

interface FeatureFlagsDataTableProps {
  owner: WorkspaceType;
  whitelistableFeatures: WhitelistableFeature[];
}

function prepareFeatureFlagsForDisplay(
  owner: WorkspaceType,
  whitelistableFeatures: WhitelistableFeature[]
) {
  return whitelistableFeatures.map((ff) => {
    const isEnabledForWorkspace = owner.flags.some((f) => f === ff);

    return {
      name: ff,
      enabled: isEnabledForWorkspace,
    };
  });
}

export function FeatureFlagsDataTable({
  owner,
  whitelistableFeatures,
}: FeatureFlagsDataTableProps) {
  const router = useRouter();
  const sendNotification = useContext(SendNotificationsContext);

  return (
    <div className="border-material-200 my-4 flex flex-col rounded-lg border p-4">
      <h2 className="text-md mb-4 font-bold">Feature flags:</h2>
      <DataTable
        columns={makeColumnsForFeatureFlags(
          owner,
          router.reload,
          sendNotification
        )}
        data={prepareFeatureFlagsForDisplay(owner, whitelistableFeatures)}
      />
    </div>
  );
}
