import { isOAuthProvider } from "@dust-tt/types";

import {
  createConnectionAndGetRedirectURL,
  isOAuthUseCase,
} from "@app/lib/api/oauth";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";

export const getServerSideProps = withDefaultUserAuthRequirements<object>(
  async (context, auth) => {
    if (!auth.workspace() || !auth.user()) {
      return {
        notFound: true,
      };
    }

    console.log("context.query", context.query);
    const provider = context.query.provider as string;
    if (!isOAuthProvider(provider)) {
      return {
        notFound: true,
      };
    }

    const useCase = context.query.useCase as string;
    if (!isOAuthUseCase(useCase)) {
      return {
        notFound: true,
      };
    }

    // Optionally retrieve connectionId to update an existing connection.
    // const connectionId = (context.query.connectionId as string) || null;

    const urlRes = await createConnectionAndGetRedirectURL(
      auth,
      provider,
      useCase
    );

    if (!urlRes.isOk()) {
      console.log("urlRes.error", urlRes.error);
      return {
        notFound: true,
      };
    }

    return {
      redirect: {
        destination: urlRes.value,
        permanent: false,
      },
    };
  }
);

export default function Redirect() {
  return <></>;
}
