import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";

import { LLMTracePage } from "@app/components/poke/pages/LLMTracePage";
import PokeLayout from "@app/components/poke/PokeLayout";
import { isLLMTraceId } from "@app/lib/api/llm/traces/buffer";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import type { LightWorkspaceType } from "@app/types";
import { isString } from "@app/types";

export const getServerSideProps = withSuperUserAuthRequirements<{
  owner: LightWorkspaceType;
  runId: string;
}>(async (context, auth) => {
  const owner = auth.getNonNullableWorkspace();

  const { wId, runId } = context.params ?? {};
  if (!isString(wId) || !isString(runId) || !isLLMTraceId(runId)) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner,
      runId,
    },
  };
});

export default function LLMTracePageNextJS({
  owner,
  runId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return <LLMTracePage owner={owner} runId={runId} />;
}

LLMTracePageNextJS.getLayout = (
  page: ReactElement,
  { owner }: { owner: LightWorkspaceType }
) => {
  return <PokeLayout title={`${owner.name} - LLM Trace`}>{page}</PokeLayout>;
};
