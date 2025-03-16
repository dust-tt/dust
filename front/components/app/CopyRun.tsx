import "@uiw/react-textarea-code-editor/dist.css";

import { useMemo } from "react";

import { ViewAppAPIModal } from "@app/components/app/ViewAppAPIModal";
import { useRunBlock } from "@app/lib/swr/apps";
import type {
  AppType,
  RunType,
  SpecificationType,
  WorkspaceType,
} from "@app/types";

interface CopyRunProps {
  app: AppType;
  disabled: boolean;
  owner: WorkspaceType;
  run: RunType;
  spec: SpecificationType;
}

export default function CopyRun({
  app,
  disabled,
  owner,
  run,
  spec,
}: CopyRunProps) {
  const [firstBlock] = spec;

  const { run: runDetails } = useRunBlock(
    owner,
    app,
    run.run_id,
    firstBlock.type,
    firstBlock.name,
    () => {
      return 0;
    }
  );

  const inputs = useMemo(() => {
    if (!runDetails) {
      return undefined;
    }

    const traces = runDetails.traces[0][1];

    return traces.map((t) => t[0].value);
  }, [runDetails]);

  return (
    <ViewAppAPIModal
      owner={owner}
      app={app}
      run={run}
      disabled={disabled}
      inputs={inputs}
    />
  );
}
