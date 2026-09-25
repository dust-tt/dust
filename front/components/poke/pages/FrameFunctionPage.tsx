import { FrameFunctionInvocations } from "@app/components/poke/frames/functions/invocations";
import { FrameFunctionSource } from "@app/components/poke/frames/functions/source";
import { FrameFunctionVersionsTable } from "@app/components/poke/frames/functions/versions";
import { ViewFrameFunctionTable } from "@app/components/poke/frames/functions/view";
import type { PokeFrameFunctionVersion } from "@app/lib/api/poke/frames";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import {
  useAppRouter,
  useRequiredPathParam,
  useSearchParam,
} from "@app/lib/platform";
import { usePokePageMetadata } from "@app/poke/swr/currentPage";
import {
  frameFunctionNameInvocationsUrl,
  usePokeFrameFunctionDetails,
  usePokeFrameFunctionVersions,
} from "@app/poke/swr/frame_function_details";
import { isValidSandboxFunctionSlug } from "@app/types/api/sandbox_functions";
import type { LightWorkspaceType } from "@app/types/user";
import { Chip, LinkWrapper, Spinner } from "@dust-tt/sparkle";
import { useEffect } from "react";

/**
 * A Frame function, addressed by its name: the name is stable across publications, while each
 * publication that declares it adds a version with its own sId. `?version=<sId>` selects the
 * version whose details and source are shown; invocations span every version.
 */
export function FrameFunctionPage() {
  const owner = useWorkspace();

  // The Frame is addressed by its file sId, since a Frame v2 is a FileResource.
  const frameId = useRequiredPathParam("sId");
  const functionName = useRequiredPathParam("functionName");

  // A function sId never passes as a name: this is a link from before pages were per name.
  if (!isValidSandboxFunctionSlug(functionName)) {
    return (
      <FunctionVersionRedirect
        frameId={frameId}
        functionId={functionName}
        owner={owner}
      />
    );
  }

  return (
    <FrameFunctionByName frameId={frameId} owner={owner} slug={functionName} />
  );
}

function PageSpinner() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Spinner />
    </div>
  );
}

function PageError({ message }: { message: string }) {
  return (
    <div className="flex h-64 items-center justify-center">
      <p>{message}</p>
    </div>
  );
}

interface FunctionVersionRedirectProps {
  frameId: string;
  functionId: string;
  owner: LightWorkspaceType;
}

function FunctionVersionRedirect({
  frameId,
  functionId,
  owner,
}: FunctionVersionRedirectProps) {
  const router = useAppRouter();
  const { frameFunction, isError } = usePokeFrameFunctionDetails({
    owner,
    frameId,
    functionId,
  });

  useEffect(() => {
    if (frameFunction) {
      void router.replace(
        `/poke/${owner.sId}/files/${frameId}/functions/${frameFunction.slug}?version=${functionId}`
      );
    }
  }, [frameFunction, frameId, functionId, owner.sId, router]);

  return isError ? (
    <PageError message="Error loading Frame function details." />
  ) : (
    <PageSpinner />
  );
}

interface FrameFunctionByNameProps {
  frameId: string;
  owner: LightWorkspaceType;
  slug: string;
}

function FrameFunctionByName({
  frameId,
  owner,
  slug,
}: FrameFunctionByNameProps) {
  const requestedVersionId = useSearchParam("version");
  const { versions, isLoading, isError } = usePokeFrameFunctionVersions({
    owner,
    frameId,
    slug,
  });

  usePokePageMetadata({ name: slug, subtitle: owner.name, sId: frameId });

  if (isLoading) {
    return <PageSpinner />;
  }

  if (isError || !versions) {
    return <PageError message="Error loading Frame function versions." />;
  }

  const activePublicationId =
    versions.find((version) => version.isActivePublication)?.publicationId ??
    null;
  // The requested version, else the active one, else the latest (versions are newest first).
  const selectedVersion: PokeFrameFunctionVersion =
    versions.find((version) => version.sId === requestedVersionId) ??
    versions.find((version) => version.isActivePublication) ??
    versions[0];

  return (
    <>
      <h3 className="text-xl font-bold">
        Frame function {slug} in frame{" "}
        <LinkWrapper
          href={`/poke/${owner.sId}/files/${frameId}`}
          className="text-highlight-500"
        >
          {frameId}
        </LinkWrapper>
      </h3>
      <p className="pt-1 text-sm text-muted-foreground">
        Every version still on record: superseded versions and their invocations
        are purged by retention.
      </p>
      <FrameFunctionVersionsTable
        frameId={frameId}
        owner={owner}
        selectedVersionId={selectedVersion.sId}
        slug={slug}
        versions={versions}
      />
      <SelectedVersion
        frameId={frameId}
        functionId={selectedVersion.sId}
        owner={owner}
      />
      <FrameFunctionInvocations
        activePublicationId={activePublicationId}
        frameId={frameId}
        invocationsUrl={frameFunctionNameInvocationsUrl({
          owner,
          frameId,
          slug,
        })}
        owner={owner}
      />
    </>
  );
}

interface SelectedVersionProps {
  frameId: string;
  functionId: string;
  owner: LightWorkspaceType;
}

function SelectedVersion({ frameId, functionId, owner }: SelectedVersionProps) {
  const { frameFunction, isLoading, isError } = usePokeFrameFunctionDetails({
    owner,
    frameId,
    functionId,
  });

  if (isLoading) {
    return <PageSpinner />;
  }

  if (isError || !frameFunction) {
    return <PageError message="Error loading this version's details." />;
  }

  return (
    <>
      <h2 className="text-md pt-2 font-bold">Version {functionId}</h2>
      {!frameFunction.isActivePublication && (
        <div className="pt-2">
          <Chip
            color="warning"
            label="This version belongs to a superseded publication"
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
        </div>
      </div>
    </>
  );
}
