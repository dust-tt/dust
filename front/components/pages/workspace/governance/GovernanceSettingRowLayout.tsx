import { Page } from "@dust-tt/sparkle";
import type { ReactNode } from "react";

interface GovernanceSettingRowLayoutProps {
  label: string;
  description: string;
  action?: ReactNode;
  children?: ReactNode;
}

export const GovernanceSettingRowLayout = ({
  label,
  description,
  action,
  children,
}: GovernanceSettingRowLayoutProps) => {
  return (
    <div className="flex w-full flex-col gap-3 p-4">
      <div className="flex w-full items-center justify-between gap-4">
        <Page.Vertical gap="xs" sizing="grow">
          <Page.H variant="h6">{label}</Page.H>
          <Page.P variant="secondary" size="sm">
            {description}
          </Page.P>
        </Page.Vertical>
        {action}
      </div>
      {children}
    </div>
  );
};
