import { Page, SliderToggle } from "@dust-tt/sparkle";

interface RestrictedAccessHeaderProps {
  isRestricted: boolean;
  onToggle: () => void;
  unrestrictedDescription: string;
}

export function RestrictedAccessHeader({
  isRestricted,
  onToggle,
  unrestrictedDescription,
}: RestrictedAccessHeaderProps) {
  return (
    <>
      <div className="flex w-full items-center justify-between overflow-visible">
        <Page.SectionHeader title="Restricted Access" />
        <SliderToggle selected={isRestricted} onClick={onToggle} />
      </div>
      {isRestricted ? (
        <span>Restricted access is active.</span>
      ) : (
        <span>{unrestrictedDescription}</span>
      )}
    </>
  );
}
