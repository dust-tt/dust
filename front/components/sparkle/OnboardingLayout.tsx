import { useAppHeadSetup } from "@app/hooks/useAppHeadSetup";
import { useDocumentTitle } from "@app/hooks/useDocumentTitle";
import type { LightWorkspaceType } from "@app/types/user";
import { Page } from "@dust-tt/sparkle";
import type React from "react";

export default function OnboardingLayout({
  owner,
  children,
}: {
  owner: LightWorkspaceType;
  children: React.ReactNode;
}) {
  useDocumentTitle(`Dust - ${owner.name || "Onboarding"}`);
  useAppHeadSetup();

  return <Page>{children}</Page>;
}
