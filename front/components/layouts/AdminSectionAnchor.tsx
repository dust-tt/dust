import type { AdminSectionId } from "@app/lib/admin/adminSectionIds";
import { cn } from "@dust-tt/sparkle";
import type { ReactNode } from "react";

/** Anchor + highlight shell shared by admin section layouts. */
export const ADMIN_SECTION_ANCHOR_CLASSNAME = cn(
  "flex w-full scroll-mt-6 flex-col gap-4 rounded-2xl transition-shadow duration-700",
  "[&.is-target]:shadow-[0_0_0_4px_var(--color-highlight-300)]"
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
