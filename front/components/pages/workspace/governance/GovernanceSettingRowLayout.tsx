import { BookOpen01, Page } from "@dust-tt/sparkle";
import type { ReactNode } from "react";

interface GovernanceSettingRowLayoutProps {
  label: ReactNode;
  description: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  documentationUrl?: string;
}

export const GovernanceSettingRowLayout = ({
  label,
  description,
  action,
  children,
  documentationUrl,
}: GovernanceSettingRowLayoutProps) => {
  return (
    <div className="flex w-full flex-col gap-3 p-4">
      <div className="flex w-full items-center justify-between gap-4">
        <Page.Vertical gap="xs" sizing="grow">
          <Page.H variant="h6">{label}</Page.H>
          <div className="flex flex-row items-center gap-2">
            <Page.P variant="secondary" size="sm">
              {description}
            </Page.P>
            {documentationUrl && (
              <a
                href={documentationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-action-400 hover:text-action-500 text-sm"
              >
                <BookOpen01 className="h-4 w-4" />
              </a>
            )}
          </div>
        </Page.Vertical>
        {action}
      </div>
      {children}
    </div>
  );
};
