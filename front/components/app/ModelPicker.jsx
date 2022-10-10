import { Menu, Transition } from "@headlessui/react";
import { classNames } from "../../lib/utils";
import { Fragment } from "react";
import { useProviders } from "../../lib/swr";
import { ChevronDownIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  filterModelProviders,
  getProviderLLMModels,
} from "../../lib/providers";
import { useState } from "react";

export default function ModelPicker({ model, readOnly, onModelUpdate }) {
  const { data: session } = useSession();

  let { providers, isProvidersLoading, isProvidersError } = useProviders();
  let modelProviders = filterModelProviders(providers);

  let [models, setModels] = useState([]);

  // Remove the model if its provider was disabled.
  if (
    !isProvidersLoading &&
    !isProvidersError &&
    model &&
    model.provider_id &&
    model.provider_id.length > 0 &&
    modelProviders.filter((p) => p.providerId == model.provider_id).length == 0
  ) {
    setTimeout(() => {
      onModelUpdate({
        provider_id: "",
        model_id: "",
      });
    });
  }

  const refreshModels = () => {
    let provider = providers.find((p) => p.providerId == model.provider_id);
    if (provider) {
      getProviderLLMModels(
        provider.providerId,
        JSON.parse(provider.config)
      ).then((m) => {
        setModels(m.models);
        // console.log("MODELS REFRESHED", m.models);
      });
    }
  };

  if (
    !isProvidersError &&
    !isProvidersLoading &&
    model.provider_id &&
    model.provider_id.length > 0
  ) {
    if (!models || models.length == 0) {
      refreshModels();
    }
  }

  return (
    <div className="flex items-center">
      <div className="flex items-center">
        <div className="font-bold text-gray-700 text-sm">
          {(model.provider_id && model.provider_id.length) > 0
            ? model.provider_id
            : ""}
        </div>
        <Menu as="div" className="relative inline-block text-left">
          <div>
            {providers.length == 0 ? (
              <Link href={`/${session.user.username}/providers`}>
                <a
                  className={classNames(
                    "inline-flex items-center rounded-md py-1 text-sm font-normal",
                    (model.provider_id && model.provider_id.length) > 0
                      ? "px-1"
                      : "border px-3",
                    readOnly
                      ? "text-gray-300 border-white"
                      : "text-gray-700 border-gray-200",
                    "focus:outline-none focus:ring-0"
                  )}
                >
                  {isProvidersLoading ? "Loading..." : "Setup provider"}
                </a>
              </Link>
            ) : (
              <Menu.Button
                className={classNames(
                  "inline-flex items-center rounded-md py-1 text-sm font-normal",
                  model.provider_id && model.provider_id.length > 0
                    ? "px-0"
                    : "border px-3",
                  readOnly
                    ? "text-gray-300 border-white"
                    : "text-gray-700 border-gray-200",
                  "focus:outline-none focus:ring-0"
                )}
                readOnly={readOnly}
              >
                {model.provider_id && model.provider_id.length > 0 ? (
                  <>
                    &nbsp;
                    <ChevronDownIcon className="h-4 w-4 hover:text-gray-700 mt-0.5" />
                  </>
                ) : (
                  "Select provider"
                )}
              </Menu.Button>
            )}
          </div>

          {readOnly ? null : (
            <Transition
              as={Fragment}
              enter="transition ease-out duration-100"
              enterFrom="transform opacity-0 scale-95"
              enterTo="transform opacity-100 scale-100"
              leave="transition ease-in duration-75"
              leaveFrom="transform opacity-100 scale-100"
              leaveTo="transform opacity-0 scale-95"
            >
              <Menu.Items
                className={classNames(
                  "absolute shadow left-1 z-10 mt-1 origin-top-left rounded-md bg-white ring-1 ring-black ring-opacity-5 focus:outline-none",
                  model.provider_id && model.provider_id.length > 0
                    ? "-left-12"
                    : "left-1"
                )}
              >
                <div className="py-1">
                  {providers.map((p) => {
                    return (
                      <Menu.Item
                        key={p.providerId}
                        onClick={() => {
                          setModels([]);
                          onModelUpdate({
                            provider_id: p.providerId,
                            model_id: "",
                          });
                        }}
                      >
                        {({ active }) => (
                          <a
                            href="#"
                            className={classNames(
                              active
                                ? "bg-gray-50 text-gray-900"
                                : "text-gray-700",
                              "block px-4 py-2 text-sm"
                            )}
                          >
                            {p.providerId}
                          </a>
                        )}
                      </Menu.Item>
                    );
                  })}
                </div>
              </Menu.Items>
            </Transition>
          )}
        </Menu>
      </div>

      {model.provider_id && model.provider_id.length > 0 ? (
        <div className="flex items-center ml-2">
          <div className="font-bold text-gray-700 text-sm">
            {(model.model_id && model.model_id.length) > 0
              ? model.model_id
              : ""}
          </div>
          <Menu as="div" className="relative inline-block text-left">
            <div>
              <Menu.Button
                className={classNames(
                  "inline-flex items-center rounded-md py-1 text-sm font-normal",
                  model.model_id && model.model_id.length > 0
                    ? "px-0"
                    : "border px-3",
                  readOnly
                    ? "text-gray-300 border-white"
                    : "text-gray-700 border-gray-200",
                  "focus:outline-none focus:ring-0"
                )}
                readOnly={readOnly}
              >
                {model.model_id && model.model_id.length > 0 ? (
                  <>
                    &nbsp;
                    <ChevronDownIcon className="h-4 w-4 hover:text-gray-700 mt-0.5" />
                  </>
                ) : (
                  "Select model"
                )}
              </Menu.Button>
            </div>

            {readOnly ? null : (
              <Transition
                as={Fragment}
                enter="transition ease-out duration-100"
                enterFrom="transform opacity-0 scale-95"
                enterTo="transform opacity-100 scale-100"
                leave="transition ease-in duration-75"
                leaveFrom="transform opacity-100 scale-100"
                leaveTo="transform opacity-0 scale-95"
              >
                <Menu.Items
                  className={classNames(
                    "absolute shadow z-10 mt-1 origin-top-left rounded-md bg-white ring-1 ring-black ring-opacity-5 focus:outline-none",
                    model.model_id && model.model_id.length > 0
                      ? "-left-24"
                      : "left-1"
                  )}
                >
                  <div className="py-1">
                    {models.map((m) => {
                      return (
                        <Menu.Item
                          key={m.id}
                          onClick={() =>
                            onModelUpdate({
                              provider_id: model.provider_id,
                              model_id: m.id,
                            })
                          }
                        >
                          {({ active }) => (
                            <a
                              href="#"
                              className={classNames(
                                active
                                  ? "bg-gray-50 text-gray-900"
                                  : "text-gray-700",
                                "block px-4 py-2 text-sm w-40"
                              )}
                            >
                              {m.id}
                            </a>
                          )}
                        </Menu.Item>
                      );
                    })}
                  </div>
                </Menu.Items>
              </Transition>
            )}
          </Menu>
        </div>
      ) : (
        <></>
      )}
    </div>
  );
}
