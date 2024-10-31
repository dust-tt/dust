import { isOAuthProvider, isOAuthUseCase } from "@dust-tt/types";

import { createConnectionAndGetSetupUrl } from "@app/lib/api/oauth";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";

export const getServerSideProps = withDefaultUserAuthRequirements<object>(
  async (context, auth) => {
    if (!auth.workspace() || !auth.user()) {
      return {
        notFound: true,
      };
    }

    const { provider, useCase, extraConfig } = context.query;

    if (!isOAuthProvider(provider)) {
      return {
        notFound: true,
      };
    }
    if (!isOAuthUseCase(useCase)) {
      return {
        notFound: true,
      };
    }
    if (extraConfig && typeof extraConfig !== "string") {
      return {
        notFound: true,
      };
    }

    const urlRes = await createConnectionAndGetSetupUrl(
      auth,
      provider,
      useCase,
      extraConfig || null
    );

    if (!urlRes.isOk()) {
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
