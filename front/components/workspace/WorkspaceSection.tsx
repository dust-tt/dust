import { Icon, Page } from "@dust-tt/sparkle";
import type React from "react";
import type { ComponentType } from "react";

interface WorkspaceSectionProps {
  icon: ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}

export function WorkspaceSection({
  icon,
  title,
  children,
}: WorkspaceSectionProps) {
  return (
    <Page.Vertical gap="xl">
      <div className="flex w-full flex-col gap-4">
        <Page.H variant="h4">
          <div className="flex items-center gap-2">
            <Icon visual={icon} />
            {title}
          </div>
        </Page.H>
        {children}
      </div>
    </Page.Vertical>
  );
}
