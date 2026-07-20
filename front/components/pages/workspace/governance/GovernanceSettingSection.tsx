import { Icon, Page } from "@dust-tt/sparkle";
import type { ComponentType, ReactNode } from "react";

interface GovernanceSettingSectionProps {
  label: string;
  icon: ComponentType;
  children: ReactNode;
}

export const GovernanceSettingSection = ({
  label,
  icon,
  children,
}: GovernanceSettingSectionProps) => {
  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-col">
        <div className="flex items-center gap-2">
          <Icon visual={icon} className="text-muted-foreground" />
          <Page.H variant="h5">{label}</Page.H>
        </div>
      </div>
      <div className="w-full rounded-xl border border-border divide-y divide-border">
        {children}
      </div>
    </div>
  );
};
