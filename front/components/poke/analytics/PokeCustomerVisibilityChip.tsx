import { usePokeFeatureFlags } from "@app/lib/swr/poke";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { LightWorkspaceType } from "@app/types/user";
import { Chip } from "@dust-tt/sparkle";

interface PokeCustomerVisibilityChipProps {
  feature: WhitelistableFeature;
  owner: LightWorkspaceType;
}

export function PokeCustomerVisibilityChip({
  feature,
  owner,
}: PokeCustomerVisibilityChipProps) {
  const {
    data: featureFlags,
    isError,
    isLoading,
  } = usePokeFeatureFlags({
    owner,
  });
  const isEnabled = featureFlags.some((flag) => flag.name === feature);

  if (isLoading) {
    return <Chip label="Checking feature" color="info" size="mini" isBusy />;
  }

  if (isError) {
    return <Chip label="Feature unknown" color="warning" size="mini" />;
  }

  return (
    <Chip
      label={isEnabled ? "Enabled" : "Feature disabled"}
      color={isEnabled ? "success" : "primary"}
      size="mini"
    />
  );
}
