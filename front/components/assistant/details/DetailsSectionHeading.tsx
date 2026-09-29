export function EditedDot() {
  return (
    <span
      role="img"
      aria-label="Edited"
      className="inline-block size-2 shrink-0 rounded-full bg-gradient-to-b from-highlight-400 to-highlight-500"
    />
  );
}

export function EditedSectionBar() {
  return (
    <span
      role="img"
      aria-label="Edited"
      className="absolute inset-y-0 -left-[9px] w-[3px] rounded-l-xl bg-highlight-400"
    />
  );
}

interface DetailsSectionHeadingProps {
  label: string;
}

export function DetailsSectionHeading({ label }: DetailsSectionHeadingProps) {
  return <div className="heading-lg text-foreground">{label}</div>;
}
