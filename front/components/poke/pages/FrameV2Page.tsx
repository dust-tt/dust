import { useWorkspace } from "@app/lib/auth/AuthContext";
import { usePokeFrameDetails } from "@app/poke/swr/frames";
import { Spinner } from "@dust-tt/sparkle";

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
      <h3 className="text-xl font-bold">Frame {details.frame.fileName}</h3>
      <div className="text-sm text-muted-foreground">
        Frame ID: <code className="text-xs">{details.frame.sId}</code>
      </div>
    </div>
  );
}
