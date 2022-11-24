import { Fragment, useState } from "react";
import Link from "next/link";
import { classNames } from "../../lib/utils";
import { Dialog, Transition } from "@headlessui/react";
import { CubeIcon } from "@heroicons/react/20/solid";
import { HighlightButton, Button } from "../Button";

const cleanUpConfig = (config) => {
  if (!config) {
    return "{}";
  }
  let c = {};
  for (var key in config.blocks) {
    if (config.blocks[key].type !== "input") {
      c[key] = config.blocks[key];
      delete c[key].type;
    }
  }
  return JSON.stringify(c);
};

export default function Deploy({ user, app, spec, run, disabled, url }) {
  const [open, setOpen] = useState(false);

  console.log(url);

  return (
    <div>
      <HighlightButton
        disabled={disabled}
        onClick={() => {
          setOpen(!open);
        }}
      >
        <CubeIcon className="-ml-1 mr-1 h-5 w-5" />
        Deploy
      </HighlightButton>

      <Transition.Root show={open} as={Fragment}>
        <Dialog as="div" className="relative z-10" onClose={() => {}}>
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
            <div className="flex min-h-full items-end justify-center p-4 items-center">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                leave="ease-in duration-200"
                leaveTo="opacity-0"
              >
                <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white px-4 pt-5 pb-4 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-4xl lg:max-w-4xl sm:p-6">
                  <div>
                    <div className="mt-3">
                      <Dialog.Title
                        as="h3"
                        className="text-lg font-medium leading-6 text-gray-900"
                      >
                        Run by API
                      </Dialog.Title>
                      <div className="mt-6 rounded-md bg-gray-700 px-4 py-4 text-sm text-white font-mono">
                        curl -XPOST {url}/api/v1/apps/{user}/{app.sId}
                        /runs \<br />
                        &nbsp;-H "Authorization: Bearer{" "}
                        <Link href={`/${user}/keys`}>
                          <a
                            className={classNames(
                              "inline-flex items-center rounded-md py-1 text-sm font-bold",
                              "text-violet-400"
                            )}
                          >
                            YOUR_API_KEY
                          </a>
                        </Link>
                        " \<br />
                        &nbsp;-H "Content-Type: application/json" \<br />
                        &nbsp;-d '{"{"}
                        <br />
                        &nbsp;&nbsp;"specification_hash": "{run?.app_hash}",
                        <br />
                        &nbsp;&nbsp;"config": {cleanUpConfig(run?.config)},
                        <br />
                        &nbsp;&nbsp;"blocking": true,
                        <br />
                        &nbsp;&nbsp;"inputs": {'[{ "hello": "world" }]'}
                        <br />
                        {"  }"}'
                      </div>
                      <div className="mt-6">
                        <p className="text-sm text-gray-500">
                          You can create an API key{" "}
                          <Link href={`/${user}/keys`}>
                            <a
                              className={classNames(
                                "inline-flex items-center rounded-md py-1 text-sm font-bold",
                                "text-violet-600"
                              )}
                            >
                              here
                            </a>
                          </Link>
                          . Do not share your API key: when run with your API
                          key, the app will use the providers set-up on your
                          account.
                        </p>
                      </div>
                      <div className="mt-4 text-sm font-bold">Parameters:</div>
                      <ul className="list-disc px-4 space-y-1 mt-1">
                        <li className="text-sm">
                          <span className="font-mono text-gray-600 mr-2">
                            specification_hash:
                          </span>
                          The hash of the current specification, you don't need
                          to change it and can copy the value above.
                        </li>
                        <li className="text-sm">
                          <span className="font-mono text-gray-600 mr-2">
                            config:
                          </span>
                          The configuration of the app (providers, models to
                          use, ...) as used in your last run, you don't need to
                          change it and can copy the value above.
                        </li>
                        <li className="text-sm">
                          <span className="font-mono text-gray-600 mr-2">
                            blocking:
                          </span>
                          Whether to block the API call until the app has
                          finished running. If set to{" "}
                          <span className="font-mono">false</span>, the API call
                          will return directly with the current status of the
                          run. You can then poll the run using{" "}
                          <span className="font-mono">
                            GET /api/v1/apps/{user}/{app.sId}/&lt;run_id&gt;
                          </span>
                        </li>
                        <li className="text-sm">
                          <span className="font-mono text-gray-600 mr-2">
                            inputs:
                          </span>
                          An array of inputs to run your app on, represented as
                          JSON objects.
                        </li>
                      </ul>

                      <div className="mt-4 text-sm font-bold">Response:</div>
                      <ul className="list-disc px-4 space-y-1 mt-1">
                        <li className="text-sm">
                          <span className="font-mono text-gray-600 mr-2">
                            status:
                          </span>
                          An object containing the status of the run as well as
                          the status of each individual block.
                        </li>
                        <li className="text-sm">
                          <span className="font-mono text-gray-600 mr-2">
                            traces:
                          </span>
                          A trace of each block execution, containing the output
                          of the block on each input.
                        </li>
                        <li className="text-sm">
                          <span className="font-mono text-gray-600 mr-2">
                            results:
                          </span>
                          Only set if the run status is{" "}
                          <span className="font-mono">succeeded</span>. The
                          outputs of the last block of the app.
                        </li>
                      </ul>
                    </div>
                  </div>
                  <div className="flex flex-row mt-5 sm:mt-6 space-x-2 items-center">
                    <div className="flex-1"></div>
                    <div className="flex flex-initial">
                      <Button onClick={() => setOpen(false)}>Close</Button>
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
