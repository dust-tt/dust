import CustomErrorPage from "@app/components/pages/CustomErrorPage";
import { LoginIcon } from "@dust-tt/sparkle";

// biome-ignore lint/plugin/nextjsPageComponentNaming: pre-existing
export default function Custom404() {
  return (
    <CustomErrorPage
      title="404: Page not found"
      description="Looks like this page took an unscheduled coffee break."
      href="/"
      label="Back to homepage"
      icon={LoginIcon}
    />
  );
}
