import type { AdminSectionId } from "@app/lib/admin/adminSectionIds";
import { cn } from "@dust-tt/sparkle";
import type { ReactNode } from "react";

/** Anchor + highlight shell shared by admin section layouts. */
export const ADMIN_SECTION_ANCHOR_CLASSNAME = cn(
  "flex w-full scroll-mt-6 flex-col gap-4 rounded-lg transition-shadow duration-700",
  "[&.is-target]:ring-4 [&.is-target]:ring-highlight-300 [&.is-target]:ring-offset-2 [&.is-target]:ring-offset-background"
);

interface AdminSectionAnchorProps {
  sectionId: AdminSectionId;
  children: ReactNode;
  className?: string;
}

/**
 * Deep-link target for admin sections (`#sectionId`). Owns `data-admin-section`
 * and the flash-highlight styles used by `useAdminSectionHighlight`.
 */
export function AdminSectionAnchor({
  sectionId,
  children,
  className,
}: AdminSectionAnchorProps) {
  return (
    <div
      data-admin-section={sectionId}
      className={cn(ADMIN_SECTION_ANCHOR_CLASSNAME, className)}
    >
      {children}
    </div>
  );
}
