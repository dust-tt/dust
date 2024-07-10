import { isOAuthAPIError } from "@dust-tt/types";

import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { createConnectionAndGetRedirectURL } from "@app/lib/oauth";

export const getServerSideProps = withDefaultUserAuthRequirements<object>(
  async (context, auth) => {
    if (!auth.workspace() || !auth.user()) {
      return {
        notFound: true,
      };
    }

    const provider = context.query.provider as string;
    if (!isOAuthAPIError(provider)) {
      return {
        notFound: true,
      };
    }

    const url = await createConnectionAndGetRedirectURL(auth, provider);
    // Optionally retrieve connectionId to update an existing connection.
    // const connectionId = (context.query.connectionId as string) || null;

    // Create a new connection
    // Generate URL for redirect

    return {
      redirect: {
        destination: `/w/${context.query.wId}/assistant/new`,
        permanent: false,
      },
    };
  }
);

export default function Redirect() {
  return <></>;
}
