import { Button, ExclamationCircleIcon, Page } from "@dust-tt/sparkle";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import type { InferGetServerSidePropsType } from "next";

import { createConnectionAndGetSetupUrl } from "@app/lib/api/oauth";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { isOAuthProvider, isOAuthUseCase } from "@app/types";
import { safeParseJSON } from "@app/types/shared/utils/json_utils";

export const ExtraConfigTypeSchema = t.record(t.string, t.string);
export type ExtraConfigType = t.TypeOf<typeof ExtraConfigTypeSchema>;

export const getServerSideProps = withDefaultUserAuthRequirements<{
  error?: string;
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
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  if (error) {
    return (
      <Page variant="normal">
        <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
          <ExclamationCircleIcon className="h-12 w-12 text-warning-500" />
          <Page.Header title="Connection Error" />
          <p className="max-w-md text-sm text-muted-foreground">{error}</p>
          <Button
            variant="outline"
            label="Go Back"
            onClick={() => window.history.back()}
          />
        </div>
      </Page>
    );
  }

  return <></>;
}
