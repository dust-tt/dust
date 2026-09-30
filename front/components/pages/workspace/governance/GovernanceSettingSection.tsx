import { AdminSectionAnchor } from "@app/components/layouts/AdminSectionAnchor";
import type { AdminSectionId } from "@app/lib/admin/adminSectionIds";
import { Icon, Page } from "@dust-tt/sparkle";
import type { ComponentType, ReactNode } from "react";

interface GovernanceSettingSectionProps {
  label: string;
  icon: ComponentType;
  children: ReactNode;
  /** Stable id for deep links (`#id`) and settings search. */
  sectionId: AdminSectionId;
  // Rendered inside the section card, below the rows and without a divider above it.
  footer?: ReactNode;
}

export const GovernanceSettingSection = ({
  label,
  icon,
  children,
  sectionId,
  footer,
}: GovernanceSettingSectionProps) => {
  return (
    <AdminSectionAnchor sectionId={sectionId}>
      <div className="flex flex-col">
        <div className="flex items-center gap-2">
          <Icon visual={icon} className="text-muted-foreground" />
          <Page.H variant="h5">{label}</Page.H>
        </div>
      </div>
      <div className="w-full rounded-xl border border-border">
        <div className="divide-y divide-border">{children}</div>
        {footer}
      </div>
    </AdminSectionAnchor>
  );
};
