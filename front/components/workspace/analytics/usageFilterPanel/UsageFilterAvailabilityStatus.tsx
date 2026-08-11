interface UsageFilterAvailabilityStatusProps {
  id?: string;
}

export function UsageFilterAvailabilityStatus({
  id,
}: UsageFilterAvailabilityStatusProps) {
  return (
    <span id={id} className="ml-auto shrink-0 text-xs font-normal text-faint">
      No activity
      <span className="sr-only"> for the selected period and filters</span>
    </span>
  );
}
