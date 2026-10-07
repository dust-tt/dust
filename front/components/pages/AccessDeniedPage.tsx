import CustomErrorPage from "@app/components/pages/CustomErrorPage";
import { LogIn01 } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";

export default function AccessDeniedPage() {
  const { t } = useLingui();

  return (
    <CustomErrorPage
      title={t`You don't have access to this page`}
      description={t`Ask a workspace admin for access.`}
      href="/"
      label={t`Back to homepage`}
      icon={LogIn01}
    />
  );
}
