import { Page, SliderToggle } from "@dust-tt/sparkle";

interface RestrictedAccessHeaderProps {
  isRestricted: boolean;
  onToggle: () => void;
  restrictedDescription: string;
  unrestrictedDescription: string;
  disabled?: boolean;
}

export function RestrictedAccessHeader({
  isRestricted,
  onToggle,
  restrictedDescription,
  unrestrictedDescription,
  disabled,
}: RestrictedAccessHeaderProps) {
  return (
    <>
      <div className="flex w-full items-center justify-between overflow-visible">
        <Page.SectionHeader title="Restricted Access" />
        <SliderToggle
          selected={isRestricted}
          onClick={onToggle}
          disabled={disabled}
        />
      </div>
      {isRestricted ? (
        <span>{restrictedDescription}</span>
      ) : (
        <span>{unrestrictedDescription}</span>
      )}
    </>
  );
}
