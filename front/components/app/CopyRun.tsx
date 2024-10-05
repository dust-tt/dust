import "@uiw/react-textarea-code-editor/dist.css";

import { Button, CubeIcon, Tooltip } from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import type { AppType, SpecificationType } from "@dust-tt/types";
import type { RunType } from "@dust-tt/types";
import { useMemo, useState } from "react";

import { ViewAppAPIModal } from "@app/components/app/Deploy";
import { useRunBlock } from "@app/lib/swr/apps";

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

  const [showViewAppAPIModal, setShowViewAppAPIModal] = useState(false);

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
    <div>
      <ViewAppAPIModal
        owner={owner}
        app={app}
        run={run}
        isOpen={showViewAppAPIModal}
        onClose={() => setShowViewAppAPIModal(false)}
        inputs={inputs}
      />
      <Tooltip
        label="Copy run specifications."
        trigger={
          <Button
            label="API"
            variant="primary"
            onClick={() => {
              setShowViewAppAPIModal(true);
            }}
            disabled={disabled}
            icon={CubeIcon}
          />
        }
      />
    </div>
  );
}
