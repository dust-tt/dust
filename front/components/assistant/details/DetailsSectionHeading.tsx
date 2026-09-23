export function EditedDot() {
  return (
    <span
      role="img"
      aria-label="Edited"
      className="inline-block h-2 w-2 shrink-0 rounded-full bg-gradient-to-b from-highlight-400 to-highlight-500 shadow-[0_0.6px_0.9px_0_rgba(0,0,0,0.08)]"
    />
  );
}

interface DetailsSectionHeadingProps {
  label: string;
  isEdited: boolean;
}

export function DetailsSectionHeading({
  label,
  isEdited,
}: DetailsSectionHeadingProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="heading-lg text-foreground">{label}</div>
      {isEdited && <EditedDot />}
    </div>
  );
}
