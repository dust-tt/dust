import CustomErrorPage from "@app/components/pages/CustomErrorPage";
import type { LightWorkspaceType } from "@app/types/user";
import { Brain, LogIn01 } from "@dust-tt/sparkle";

interface NotAvailableErrorPageProps {
  isAdmin: boolean;
  owner: LightWorkspaceType;
}

export function NotAvailableErrorPage({
  isAdmin,
  owner,
}: NotAvailableErrorPageProps) {
  const restOfProps = isAdmin
    ? {
        href: `/w/${owner.sId}/model-providers`,
        label: "Configure model providers",
        icon: Brain,
        description:
          "Providers must be configured in your workspace to use the agent builder.",
      }
    : {
        href: "/",
        label: "Back to homepage",
        icon: LogIn01,
        description:
          "No provider is configured in your workspace. Contact your administrator.",
      };

  return (
    <CustomErrorPage title="Agent builder is not available" {...restOfProps} />
  );
}
