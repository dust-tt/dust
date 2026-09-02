import { FrameFunctionInvocations } from "@app/components/poke/frames/functions/invocations";
import { FrameFunctionSource } from "@app/components/poke/frames/functions/source";
import { ViewFrameFunctionTable } from "@app/components/poke/frames/functions/view";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { useRequiredPathParam } from "@app/lib/platform";
import { usePokePageMetadata } from "@app/poke/swr/currentPage";
import { usePokeFrameFunctionDetails } from "@app/poke/swr/frame_function_details";
import { Chip, LinkWrapper, Spinner } from "@dust-tt/sparkle";

export function FrameFunctionPage() {
  const owner = useWorkspace();

  // The Frame is addressed by its file sId, since a Frame v2 is a FileResource.
  const frameId = useRequiredPathParam("sId");
  const functionId = useRequiredPathParam("functionId");

  const { frameFunction, isLoading, isError } = usePokeFrameFunctionDetails({
    owner,
    frameId,
    functionId,
  });

  usePokePageMetadata({
    name: frameFunction?.name,
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

  if (isError || !frameFunction) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p>Error loading Frame function details.</p>
      </div>
    );
  }

  return (
    <>
      <h3 className="text-xl font-bold">
        Frame function {frameFunction.name} in frame{" "}
        <LinkWrapper
          href={`/poke/${owner.sId}/files/${frameId}`}
          className="text-highlight-500"
        >
          {frameId}
        </LinkWrapper>
      </h3>
      {frameFunction.publicationId && !frameFunction.isActivePublication && (
        <div className="pt-2">
          <Chip
            color="warning"
            label="This function belongs to a superseded publication"
            size="sm"
          />
        </div>
      )}
      <div className="flex flex-row gap-x-6">
        <ViewFrameFunctionTable frameFunction={frameFunction} />
        <div className="mt-4 flex grow flex-col">
          <FrameFunctionSource
            frameId={frameId}
            functionId={functionId}
            owner={owner}
          />
          <FrameFunctionInvocations
            frameId={frameId}
            functionId={functionId}
            owner={owner}
          />
        </div>
      </div>
    </>
  );
}
