import { Page, SliderToggle } from "@dust-tt/sparkle";
import type { ReactNode } from "react";

interface RestrictedAccessHeaderProps {
  isRestricted: boolean;
  onToggle: () => void;
  // Nodes rather than strings: both states describe read and write access on separate lines.
  restrictedDescription: ReactNode;
  unrestrictedDescription: ReactNode;
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
      <div className="flex flex-col gap-y-1">
        {isRestricted ? restrictedDescription : unrestrictedDescription}
      </div>
    </>
  );
}
