import { PodFunctionInvocations } from "@app/components/poke/projects/pod_functions/invocations";
import { PodFunctionSource } from "@app/components/poke/projects/pod_functions/source";
import { ViewPodFunctionTable } from "@app/components/poke/projects/pod_functions/view";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { useRequiredPathParam } from "@app/lib/platform";
import { usePokePageMetadata } from "@app/poke/swr/currentPage";
import { usePokePodFunction } from "@app/poke/swr/pod_function_details";
import { LinkWrapper, Spinner } from "@dust-tt/sparkle";

export function PodFunctionPage() {
  const owner = useWorkspace();

  const spaceId = useRequiredPathParam("spaceId");
  const functionId = useRequiredPathParam("functionId");

  const { podFunction, isLoading, isError } = usePokePodFunction({
    owner,
    projectId: spaceId,
    functionId,
  });

  usePokePageMetadata({
    name: podFunction?.slug,
    subtitle: owner.name,
    sId: functionId,
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (isError || !podFunction) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p>Error loading pod function details.</p>
      </div>
    );
  }

  return (
    <>
      <h3 className="text-xl font-bold">
        Pod Function {podFunction.slug} in pod{" "}
        <LinkWrapper
          href={`/poke/${owner.sId}/spaces/${spaceId}`}
          className="text-highlight-500"
        >
          {spaceId}
        </LinkWrapper>
      </h3>
      <div className="flex flex-row gap-x-6">
        <ViewPodFunctionTable podFunction={podFunction} />
        <div className="mt-4 flex grow flex-col">
          <PodFunctionSource
            functionId={functionId}
            owner={owner}
            projectId={spaceId}
          />
          <PodFunctionInvocations
            functionId={functionId}
            owner={owner}
            projectId={spaceId}
          />
        </div>
      </div>
    </>
  );
}
