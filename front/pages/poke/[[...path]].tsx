import config from "@app/lib/api/config";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";

export const getServerSideProps = withSuperUserAuthRequirements(
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

export default function PokeCatchAll() {
  // This component will never render due to the redirect
  return null;
}
