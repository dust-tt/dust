import CustomErrorPage from "@app/components/pages/CustomErrorPage";
import type { LightWorkspaceType } from "@app/types/user";
import { BrainIcon, LoginIcon } from "@dust-tt/sparkle";

export function NotAvailableErrorPage({
  isAdmin,
  owner,
}: {
  isAdmin: boolean;
  owner: LightWorkspaceType;
}) {
  const restOfProps = isAdmin
    ? {
        href: `/w/${owner.sId}/model-providers`,
        label: "Configure model providers",
        icon: BrainIcon,
        description:
          "Providers must be configured in your workspace to use the agent builder.",
      }
    : {
        href: "/",
        label: "Back to homepage",
        icon: LoginIcon,
        description:
          "No provider is configured in your workspace. Contact your administrator.",
      };

  return (
    <CustomErrorPage title="Agent builder is not available" {...restOfProps} />
  );
}
