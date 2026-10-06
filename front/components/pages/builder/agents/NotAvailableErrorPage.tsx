import CustomErrorPage from "@app/components/pages/CustomErrorPage";
import type { LightWorkspaceType } from "@app/types/user";
import { Brain, LogIn01 } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";

interface NotAvailableErrorPageProps {
  isAdmin: boolean;
  owner: LightWorkspaceType;
}

export function NotAvailableErrorPage({
  isAdmin,
  owner,
}: NotAvailableErrorPageProps) {
  const { t } = useLingui();
  const restOfProps = isAdmin
    ? {
        href: `/w/${owner.sId}/model-providers`,
        label: t`Configure model providers`,
        icon: Brain,
        description: t`Providers must be configured in your workspace to use the agent builder.`,
      }
    : {
        href: "/",
        label: t`Back to homepage`,
        icon: LogIn01,
        description: t`No provider is configured in your workspace. Contact your administrator.`,
      };

  return (
    <CustomErrorPage
      title={t`Agent builder is not available`}
      {...restOfProps}
    />
  );
}
