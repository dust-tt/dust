import { FrameDatabaseDataTable } from "@app/components/poke/frames/databases/table";
import { FrameFunctionDataTable } from "@app/components/poke/frames/functions/table";
import { FramePublicationSection } from "@app/components/poke/frames/publication";
import { FrameSharingSection } from "@app/components/poke/frames/sharing";
import { FrameStorageTable } from "@app/components/poke/frames/storage";
import { ViewFrameTable } from "@app/components/poke/frames/view";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { usePokeFrameDetails } from "@app/poke/swr/frames";
import { LinkWrapper, Spinner } from "@dust-tt/sparkle";

interface FrameV2PageProps {
  frameId: string;
}

export function FrameV2Page({ frameId }: FrameV2PageProps) {
  const owner = useWorkspace();
  const { details, isLoading, isError } = usePokeFrameDetails({
    frameId,
    owner,
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (isError || !details) {
    return (
      <div className="flex h-64 flex-col items-center justify-center">
        <div className="text-lg font-medium text-warning">
          Failed to load Frame details
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <h3 className="text-xl font-bold">
        Frame {details.frame.name ?? details.frame.fileName} within workspace{" "}
        <LinkWrapper href={`/poke/${owner.sId}`} className="text-highlight-500">
          {owner.name}
        </LinkWrapper>
      </h3>

      <ViewFrameTable details={details} owner={owner} />
      <FrameSharingSection
        sharing={details.sharing}
        sharingGrants={details.sharingGrants}
      />
      <FrameStorageTable storage={details.storage} />
      <FramePublicationSection
        publication={details.publication}
        publicationError={details.publicationError}
      />
      <FrameFunctionDataTable frameId={frameId} owner={owner} />
      <FrameDatabaseDataTable frameId={frameId} owner={owner} />
    </div>
  );
}
