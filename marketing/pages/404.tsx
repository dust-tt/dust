import { LogIn01 } from "@dust-tt/sparkle";
import CustomErrorPage from "@marketing/components/pages/CustomErrorPage";

// oxlint-disable-next-line dust/nextjsPageComponentNaming -- pre-existing
export default function Custom404() {
  return (
    <CustomErrorPage
      title="404: Page not found"
      description="Looks like this page took an unscheduled coffee break."
      href="/"
      label="Back to homepage"
      icon={LogIn01}
    />
  );
}
