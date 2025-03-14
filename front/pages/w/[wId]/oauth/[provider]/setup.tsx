import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";

import { createConnectionAndGetSetupUrl } from "@app/lib/api/oauth";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { isOAuthProvider, isOAuthUseCase, safeParseJSON } from "@app/types";

export const ExtraConfigTypeSchema = t.record(t.string, t.string);
export type ExtraConfigType = t.TypeOf<typeof ExtraConfigTypeSchema>;

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

    let parsedExtraConfig: Record<string, string> = {};
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
