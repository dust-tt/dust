import { useAppHeadSetup } from "@app/hooks/useAppHeadSetup";
import { useDocumentTitle } from "@app/hooks/useDocumentTitle";
import type { LightWorkspaceType } from "@app/types/user";
import { Page } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";
import type React from "react";

export default function OnboardingLayout({
  owner,
  children,
}: {
  owner: Pick<LightWorkspaceType, "name">;
  children: React.ReactNode;
}) {
  const { t } = useLingui();
  useDocumentTitle(owner.name ? `Dust - ${owner.name}` : t`Dust - Onboarding`);
  useAppHeadSetup();

  return <Page>{children}</Page>;
}
