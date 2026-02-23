import config from "@app/lib/api/config";
import { withPublicAuthRequirements } from "@app/lib/iam/session";

// biome-ignore lint/plugin/nextjsNoDataFetchingInGetssp: pre-existing
export const getServerSideProps = withPublicAuthRequirements(
  async (context) => {
    const { path } = context.params ?? {};
    const pathSegments = Array.isArray(path) ? path : path ? [path] : [];
    const pathString = pathSegments.join("/");

    const baseUrl = config.getAppUrl(false);
    // Forward query params (excluding path segments consumed by Next.js).
    const { path: _path, ...queryParams } = context.query;
    const queryString = new URLSearchParams(
      queryParams as Record<string, string>
    ).toString();
    const redirectUrl = pathString ? `${baseUrl}/${pathString}` : baseUrl;
    const destination = queryString
      ? `${redirectUrl}?${queryString}`
      : redirectUrl;
    return {
      redirect: {
        destination,
        permanent: false,
      },
    };
  }
);

// biome-ignore lint/plugin/nextjsPageComponentNaming: pre-existing
export default function AppCatchAll() {
  // This component will never render due to the redirect
  return null;
}
