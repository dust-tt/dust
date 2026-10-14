import { AdminSectionAnchor } from "@app/components/layouts/AdminSectionAnchor";
import type { AdminSectionId } from "@app/lib/admin/adminSectionIds";
import { SettingsList } from "@dust-tt/sparkle";
import type { ReactNode } from "react";

interface GovernanceSettingSectionProps {
  label: string;
  children: ReactNode;
  /** Stable id for deep links (`#id`) and settings search. */
  sectionId: AdminSectionId;
  // Rendered inside the section card, below the rows and without a divider above it.
  footer?: ReactNode;
}

export const GovernanceSettingSection = ({
  label,
  children,
  sectionId,
  footer,
}: GovernanceSettingSectionProps) => {
  return (
    <AdminSectionAnchor sectionId={sectionId}>
      {/* Rows keep their own dividers so the footer has none above it. */}
      <SettingsList title={label} className="divide-y-0">
        <div className="divide-y divide-border">{children}</div>
        {footer}
      </SettingsList>
    </AdminSectionAnchor>
  );
};
