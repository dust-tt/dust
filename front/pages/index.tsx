import config from "@app/lib/api/config";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";

// biome-ignore lint/plugin/nextjsNoDataFetchingInGetssp: pre-existing
export const getServerSideProps = withSuperUserAuthRequirements(async () => {
  return {
    redirect: {
      destination: config.getAppUrl(false),
      permanent: false,
    },
  };
});

// biome-ignore lint/plugin/nextjsPageComponentNaming: pre-existing
export default function IndexRedirect() {
  return null;
}
