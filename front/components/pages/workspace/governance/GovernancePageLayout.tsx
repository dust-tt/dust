import { AdminPageContainer } from "@app/components/layouts/AdminPageContainer";
import { Page } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";

interface GovernancePageLayoutProps {
  children: ReactNode;
}

export function GovernancePageLayout({ children }: GovernancePageLayoutProps) {
  const { t } = useLingui();

  return (
    <AdminPageContainer>
      <div className="flex flex-col gap-6">
        <Page.Header
          title={t`Governance`}
          description={t`Manage what members can do in your workspace`}
        />
        {children}
      </div>
    </AdminPageContainer>
  );
}
