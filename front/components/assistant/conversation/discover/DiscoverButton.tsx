import { TRACKING_AREAS, trackEvent } from "@app/lib/tracking";
import { Button } from "@dust-tt/sparkle";

interface DiscoverButtonProps {
  onClick: () => void;
}

export function DiscoverButton({ onClick }: DiscoverButtonProps) {
  return (
    <Button
      variant="primary"
      size="sm"
      isRounded
      label="Discover Skills and Agents"
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
