import "@uiw/react-textarea-code-editor/dist.css";

import { Button, CubeIcon, Tooltip } from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import type { AppType, SpecificationType } from "@dust-tt/types";
import type { RunType } from "@dust-tt/types";
import { Dialog, Transition } from "@headlessui/react";
import { Fragment, useMemo, useState } from "react";

import { DisplayCurlRequest } from "@app/components/app/Deploy";
import { useRunBlock } from "@app/lib/swr/apps";

interface CopyRunProps {
  app: AppType;
  disabled: boolean;
  owner: WorkspaceType;
  run: RunType;
  spec: SpecificationType;
  url: string;
}

export default function CopyRun({
  app,
  disabled,
  owner,
  run,
  spec,
  url,
}: CopyRunProps) {
  const [open, setOpen] = useState(false);

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
    <div>
      <Tooltip label="Copy run specifications.">
        <Button
          label="Copy run"
          variant="primary"
          onClick={() => {
            setOpen(!open);
          }}
          disabled={disabled}
          icon={CubeIcon}
        />
      </Tooltip>

      <Transition.Root show={open} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-30"
          onClose={() => setOpen(false)}
        >
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-gray-800 bg-opacity-75 transition-opacity" />
          </Transition.Child>

          <div className="fixed inset-0 z-10 overflow-y-auto">
            <div className="flex min-h-full items-end items-center justify-center p-4">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                leave="ease-in duration-200"
                leaveTo="opacity-0"
              >
                <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-4xl sm:p-6 lg:max-w-4xl">
                  <div data-color-mode="light">
                    <div className="mt-3">
                      <Dialog.Title
                        as="h3"
                        className="text-lg font-medium leading-6 text-gray-900"
                      >
                        Run as API Endpoint
                      </Dialog.Title>
                      <DisplayCurlRequest
                        app={app}
                        inputs={inputs}
                        owner={owner}
                        run={run}
                        url={url}
                      />
                    </div>
                  </div>
                  <div className="mt-5 flex flex-row items-center space-x-2 sm:mt-6">
                    <div className="flex-1"></div>
                    <div className="flex flex-initial">
                      <Button
                        variant="secondary"
                        onClick={() => setOpen(false)}
                        label="Close"
                      />
                    </div>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition.Root>
    </div>
  );
}
