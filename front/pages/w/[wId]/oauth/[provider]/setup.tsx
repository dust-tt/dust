import { isLeft } from "fp-ts/lib/Either";
import type { InferGetServerSidePropsType } from "next";
import { useEffect } from "react";

import { createConnectionAndGetSetupUrl } from "@app/lib/api/oauth";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { postOAuthMessageAndClose } from "@app/lib/oauth/postOAuthMessageAndClose";
import type { ExtraConfigType, OAuthProvider } from "@app/types";
import { ExtraConfigTypeSchema, isOAuthProvider, isOAuthUseCase } from "@app/types";
import { safeParseJSON } from "@app/types/shared/utils/json_utils";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  error?: string;
  provider?: OAuthProvider;
}>(async (context, auth) => {
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

  let parsedExtraConfig: ExtraConfigType = {};
  const parseRes = safeParseJSON(extraConfig as string);
  if (parseRes.isErr()) {
    return {
      notFound: true,
    };
  }
  const bodyValidation = ExtraConfigTypeSchema.decode(parseRes.value);
  if (isLeft(bodyValidation)) {
    return {
      notFound: true,
    };
  }
  parsedExtraConfig = bodyValidation.right;

  const urlRes = await createConnectionAndGetSetupUrl(
    auth,
    provider,
    useCase,
    parsedExtraConfig
  );

  if (!urlRes.isOk()) {
    return {
      props: {
        error: urlRes.error.message,
        provider,
      },
    };
  }

  return {
    redirect: {
      destination: urlRes.value,
      permanent: false,
    },
  };
});

export default function OAuthSetup({
  error,
  provider,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  useEffect(() => {
    if (!error || !provider) {
      return;
    }

    postOAuthMessageAndClose({
      type: "connection_finalized",
      error,
      provider,
    });
  }, [error, provider]);

  return null;
}
