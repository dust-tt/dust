import { AdminSectionAnchor } from "@app/components/layouts/AdminSectionAnchor";
import type { AdminSectionId } from "@app/lib/admin/adminSectionIds";
import { Icon, Page } from "@dust-tt/sparkle";
import type React from "react";
import type { ComponentType } from "react";

interface WorkspaceSectionProps {
  icon: ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
  /** Stable id for deep links (`#id`) and settings search. */
  sectionId: AdminSectionId;
}

export function WorkspaceSection({
  icon,
  title,
  children,
  sectionId,
}: WorkspaceSectionProps) {
  return (
    <Page.Vertical gap="xl">
      <AdminSectionAnchor sectionId={sectionId}>
        <Page.H variant="h4">
          <div className="flex items-center gap-2">
            <Icon visual={icon} />
            {title}
          </div>
        </Page.H>
        {children}
      </AdminSectionAnchor>
    </Page.Vertical>
  );
}
