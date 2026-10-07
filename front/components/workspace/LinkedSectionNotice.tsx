import { Page } from "@dust-tt/sparkle";
import type { ReactNode } from "react";

interface LinkedSectionNoticeProps {
  children: ReactNode;
}

export function LinkedSectionNotice({ children }: LinkedSectionNoticeProps) {
  return (
    <div className="w-full rounded-xl bg-muted-background px-4 py-3">
      <Page.P variant="secondary" size="sm">
        {children}
      </Page.P>
    </div>
  );
}
