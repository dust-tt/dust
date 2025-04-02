import { Button, Cog6ToothIcon } from "@dust-tt/sparkle";
import { useRouter } from "next/router";

interface FeatureAccessButtonProps {
  featureFlag: boolean;
  workspaceId: string;
  featureName: string;
  managePath: string;
}

export function FeatureAccessButton({
  featureFlag,
  workspaceId,
  featureName,
  managePath,
}: FeatureAccessButtonProps) {
  const router = useRouter();

  return featureFlag ? (
    <Button
      variant="outline"
      label="Manage"
      size="sm"
      icon={Cog6ToothIcon}
      onClick={() => router.push(managePath)}
    />
  ) : (
    <Button
      variant="outline"
      label="Request access"
      size="sm"
      onClick={() =>
        window.open(
          `mailto:support@dust.tt?subject=${encodeURIComponent(
            `Labs feature access request: ${featureName}`
          )}&body=${encodeURIComponent(
            `Please enable labs ${featureName.toLowerCase()} access for workspace id: ${workspaceId}`
          )}`,
          "_blank"
        )
      }
    />
  );
}
