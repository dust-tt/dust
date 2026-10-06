import { Trans } from "@lingui/react/macro";

interface FilterAvailabilityStatusProps {
  id?: string;
}

export function FilterAvailabilityStatus({
  id,
}: FilterAvailabilityStatusProps) {
  return (
    <span id={id} className="ml-auto shrink-0 text-xs font-normal text-faint">
      <Trans>
        No activity
        <span className="sr-only"> for the selected period and filters</span>
      </Trans>
    </span>
  );
}
