import { Fragment, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { ActionButton, Button } from "../Button";
import { useSWRConfig } from "swr";
import { checkProvider } from "../../lib/providers";

export default function BrowserlessAPISetup({
  open,
  setOpen,
  config,
  enabled,
}) {
  const { mutate } = useSWRConfig();

  const [apiKey, setApiKey] = useState(config ? config.api_key : "");
  const [testSuccessful, setTestSuccessful] = useState(false);
  const [testRunning, setTestRunning] = useState(false);
  const [testError, setTestError] = useState("");
  const [enableRunning, setEnableRunning] = useState(false);

  if (config && config.api_key.length > 0 && apiKey.length == 0) {
    setApiKey(config.api_key);
  }

  const runTest = async () => {
    setTestRunning(true);
    setTestError("");
    let check = await checkProvider("browserlessapi", { api_key: apiKey });

    if (!check.ok) {
      setTestError(check.error);
      setTestSuccessful(false);
      setTestRunning(false);
    } else {
      setTestError("");
      setTestSuccessful(true);
      setTestRunning(false);
    }
  };

  const handleEnable = async () => {
    setEnableRunning(true);
    let res = await fetch(`/api/providers/browserlessapi`, {
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
      body: JSON.stringify({
        config: JSON.stringify({
          api_key: apiKey,
        }),
      }),
    });
    setEnableRunning(false);
    mutate(`/api/providers`);
    setOpen(false);
  };

  const handleDisable = async () => {
    let res = await fetch(`/api/providers/browserlessapi`, {
      method: "DELETE",
    });
    mutate(`/api/providers`);
    setOpen(false);
  };

  return (
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
              <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white px-4 pt-5 pb-4 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-sm lg:max-w-lg sm:p-6">
                <div>
                  <div className="mt-3">
                    <Dialog.Title
                      as="h3"
                      className="text-lg font-medium leading-6 text-gray-900"
                    >
                      Setup Browserless API
                    </Dialog.Title>
                    <div className="mt-4">
                      <p className="text-sm text-gray-500">
                        Browserless lets you use headless browsers to scrape web
                        content. To use Browserless, you must provide your API
                        key. It can be found{" "}
                        <a
                          className="text-violet-600 hover:text-violet-500 font-bold"
                          href="https://cloud.browserless.io/account/"
                          target="_blank"
                        >
                          here
                        </a>
                        .
                      </p>
                      <p className="text-sm text-gray-500 mt-2">
                        Note that it generally takes{" "}
                        <span className="font-bold">5 mins</span> for the API key
                        to become active (an email is sent when it's ready).
                      </p>
                      <p className="text-sm text-gray-500 mt-2">
                        We'll never use your API key for anything other than to
                        run your apps.
                      </p>
                    </div>
                    <div className="mt-6">
                      <input
                        type="text"
                        className="shadow-sm focus:ring-violet-500 focus:border-violet-500 block w-full sm:text-sm border-gray-300 rounded-md"
                        placeholder="Browserless API Key"
                        value={apiKey}
                        onChange={(e) => {
                          setApiKey(e.target.value);
                          setTestSuccessful(false);
                        }}
                      />
                    </div>
                  </div>
                </div>
                <div className="text-sm mt-1 px-2">
                  {testError.length > 0 ? (
                    <span className="text-red-500">Error: {testError}</span>
                  ) : testSuccessful ? (
                    <span className="text-green-600">
                      Test succeeded! You can enable the Browserless API.
                    </span>
                  ) : (
                    <span>&nbsp;</span>
                  )}
                </div>
                <div className="flex flex-row mt-5 sm:mt-6 space-x-2 items-center">
                  {enabled ? (
                    <div
                      className="flex-initial text-red-500 text-sm font-bold cursor-pointer"
                      onClick={() => handleDisable()}
                    >
                      Disable
                    </div>
                  ) : (
                    <></>
                  )}
                  <div className="flex-1"></div>
                  <div className="flex flex-initial">
                    <Button onClick={() => setOpen(false)}>Cancel</Button>
                  </div>
                  <div className="flex flex-initial">
                    {testSuccessful ? (
                      <ActionButton
                        onClick={() => handleEnable()}
                        disabled={enableRunning}
                      >
                        {enabled
                          ? enableRunning
                            ? "Updating..."
                            : "Update"
                          : enableRunning
                          ? "Enabling..."
                          : "Enable"}
                      </ActionButton>
                    ) : (
                      <ActionButton
                        disabled={apiKey.length == 0 || testRunning}
                        onClick={() => runTest()}
                      >
                        {testRunning ? "Testing..." : "Test"}
                      </ActionButton>
                    )}
                  </div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
}
