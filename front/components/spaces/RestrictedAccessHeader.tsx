import { Page, SliderToggle } from "@dust-tt/sparkle";

interface RestrictedAccessHeaderProps {
  isRestricted: boolean;
  onToggle: () => void;
  restrictedDescription: string;
  unrestrictedDescription: string;
}

export function RestrictedAccessHeader({
  isRestricted,
  onToggle,
  restrictedDescription,
  unrestrictedDescription,
}: RestrictedAccessHeaderProps) {
  return (
    <>
      <div className="flex w-full items-center justify-between overflow-visible">
        <Page.SectionHeader title="Restricted Access" />
        <SliderToggle selected={isRestricted} onClick={onToggle} />
      </div>
      {isRestricted ? (
        <span>{restrictedDescription}</span>
      ) : (
        <span>{unrestrictedDescription}</span>
      )}
    </>
  );
}
