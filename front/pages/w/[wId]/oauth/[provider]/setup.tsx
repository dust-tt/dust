import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import type { InferGetServerSidePropsType } from "next";
import { useEffect } from "react";

import { createConnectionAndGetSetupUrl } from "@app/lib/api/oauth";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import type { OAuthProvider } from "@app/types";
import { isOAuthProvider, isOAuthUseCase } from "@app/types";
import { safeParseJSON } from "@app/types/shared/utils/json_utils";

export const ExtraConfigTypeSchema = t.record(t.string, t.string);
export type ExtraConfigType = t.TypeOf<typeof ExtraConfigTypeSchema>;

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

    const messageData = {
      type: "connection_finalized",
      error,
      provider,
    };

    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(messageData, window.location.origin);
    } else {
      try {
        const channel = new BroadcastChannel("oauth_finalize");
        channel.postMessage(messageData);
        setTimeout(() => channel.close(), 100);
      } catch (e) {
        // BroadcastChannel not supported or failed — nothing more we can do.
      }
    }

    setTimeout(() => {
      window.close();
      setTimeout(() => {
        window.location.href = window.location.origin;
      }, 100);
    }, 1000);
  }, [error, provider]);

  return null;
}
