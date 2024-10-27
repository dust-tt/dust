import { useSendNotification } from "@dust-tt/sparkle";
import type { WhitelistableFeature, WorkspaceType } from "@dust-tt/types";
import { useRouter } from "next/router";

import { makeColumnsForFeatureFlags } from "@app/components/poke/features/columns";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { useFeatureFlags } from "@app/lib/swr/workspaces";

interface FeatureFlagsDataTableProps {
  owner: WorkspaceType;
  whitelistableFeatures: WhitelistableFeature[];
}

function prepareFeatureFlagsForDisplay(
  workspaceFlags: WhitelistableFeature[],
  whitelistableFeatures: WhitelistableFeature[]
) {
  return whitelistableFeatures.map((ff) => {
    const isEnabledForWorkspace = workspaceFlags.some((f) => f === ff);

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
  const { featureFlags } = useFeatureFlags({ workspaceId: owner.sId });
  const sendNotification = useSendNotification();

  return (
    <div className="border-material-200 my-4 flex flex-col rounded-lg border p-4">
      <h2 className="text-md mb-4 font-bold">Feature flags:</h2>
      <PokeDataTable
        columns={makeColumnsForFeatureFlags(
          owner,
          router.reload,
          sendNotification
        )}
        data={prepareFeatureFlagsForDisplay(
          featureFlags,
          whitelistableFeatures
        )}
      />
    </div>
  );
}
