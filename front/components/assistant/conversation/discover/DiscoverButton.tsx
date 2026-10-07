import { TRACKING_AREAS, trackEvent } from "@app/lib/tracking";
import { Button } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";

interface DiscoverButtonProps {
  onClick: () => void;
}

export function DiscoverButton({ onClick }: DiscoverButtonProps) {
  const { t } = useLingui();

  return (
    <Button
      variant="primary"
      size="sm"
      isRounded
      label={t`Discover skills and agents`}
      onClick={() => {
        trackEvent({
          area: TRACKING_AREAS.DISCOVER,
          object: "discover_button",
        });
        onClick();
      }}
    />
  );
}
