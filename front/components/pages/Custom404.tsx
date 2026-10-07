import CustomErrorPage from "@app/components/pages/CustomErrorPage";
import { LogIn01 } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";

export default function Custom404() {
  const { t } = useLingui();

  return (
    <CustomErrorPage
      title={t`404: Page not found`}
      description={t`Looks like this page took an unscheduled coffee break.`}
      href="/"
      label={t`Back to homepage`}
      icon={LogIn01}
    />
  );
}
