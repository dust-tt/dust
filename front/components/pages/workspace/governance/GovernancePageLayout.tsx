import { AdminPageContainer } from "@app/components/layouts/AdminPageContainer";
import { Page } from "@dust-tt/sparkle";
import type { ReactNode } from "react";

interface GovernancePageLayoutProps {
  children: ReactNode;
}

export function GovernancePageLayout({ children }: GovernancePageLayoutProps) {
  return (
    <AdminPageContainer>
      <div className="flex flex-col gap-6">
        <Page.Header
          title="Settings & Governance"
          description="Manage what members can do in your workspace"
        />
        {children}
      </div>
    </AdminPageContainer>
  );
}
