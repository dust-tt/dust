import { isOAuthProvider } from "@dust-tt/types";

import {
  createConnectionAndGetSetupUrl,
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

    console.log(
      ">>>>>>>>>>>>>>>>>>>>>>>>>>>>> HEADERS <<<<<<<<<<<<<<<<<<<<<<<<<<<<<"
    );
    console.log(context.req.headers);

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

    const urlRes = await createConnectionAndGetSetupUrl(
      auth,
      provider,
      useCase
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
