interface FilterAvailabilityStatusProps {
  id?: string;
  label?: string;
}

export function FilterAvailabilityStatus({
  id,
  label = "No activity",
}: FilterAvailabilityStatusProps) {
  return (
    <span id={id} className="ml-auto shrink-0 text-xs font-normal text-faint">
      {label}
      <span className="sr-only"> for the selected period and filters</span>
    </span>
  );
}
