import config from "@app/lib/api/config";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";

// biome-ignore lint/plugin/nextjsNoDataFetchingInGetssp: pre-existing
export const getServerSideProps = withSuperUserAuthRequirements(
  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  async (context) => {
    const { path } = context.params ?? {};
    const pathSegments = Array.isArray(path) ? path : path ? [path] : [];
    const pathString = pathSegments.join("/");

    const baseUrl = config.getPokeAppUrl();
    const redirectUrl = pathString ? `${baseUrl}/${pathString}` : baseUrl;

    return {
      redirect: {
        destination: redirectUrl,
        permanent: false,
      },
    };
  }
);

// biome-ignore lint/plugin/nextjsPageComponentNaming: pre-existing
export default function PokeCatchAll() {
  // This component will never render due to the redirect
  return null;
}
