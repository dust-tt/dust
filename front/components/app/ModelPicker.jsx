import { Menu } from "@headlessui/react";
import { classNames } from "@app/lib/utils";
import { useEffect } from "react";
import { useProviders } from "@app/lib/swr";
import { ChevronDownIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import {
  filterModelProviders,
  getProviderLLMModels,
} from "@app/lib/providers";
import { useState } from "react";

export default function ModelPicker({
  user,
  model,
  readOnly,
  onModelUpdate,
  chatOnly,
  embedOnly,
}) {
  let { providers, isProvidersLoading, isProvidersError } = readOnly
    ? {
        providers: [],
        isProvidersLoading: false,
        isProvidersError: false,
      }
    : useProviders();
  let modelProviders = filterModelProviders(providers, !!chatOnly, !!embedOnly);

  let [models, setModels] = useState(null);

  // Remove the model if its provider was disabled.
  if (
    !readOnly &&
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
        JSON.parse(provider.config),
        !!chatOnly,
        !!embedOnly
      ).then((m) => {
        setModels(m.models);
      });
    }
  };

  useEffect(() => {
    if (
      !readOnly &&
      !isProvidersError &&
      !isProvidersLoading &&
      model.provider_id &&
      model.provider_id.length > 0
    ) {
      if (models === null) {
        refreshModels();
      }
    }
  });

  return (
    <div className="flex items-center">
      <div className="flex items-center">
        <Menu as="div" className="relative inline-block text-left">
          <div>
            {modelProviders.length == 0 &&
            !(model.provider_id && model.provider_id.length > 0) &&
            !readOnly ? (
              <Link
                href={`/${user}/providers`}
                className={classNames(
                  "inline-flex items-center rounded-md py-1 text-sm font-bold",
                  (model.provider_id && model.provider_id.length) > 0
                    ? "px-1"
                    : "border px-3",
                  readOnly
                    ? "text-gray-300 border-white"
                    : "text-gray-700 border-orange-400",
                  "focus:outline-none focus:ring-0"
                )}
              >
                {isProvidersLoading ? "Loading..." : "Setup provider"}
              </Link>
            ) : readOnly ? (
              <div className="font-bold text-gray-700 text-sm">
                {model.provider_id && model.provider_id.length > 0
                  ? model.provider_id
                  : ""}
              </div>
            ) : (
              <Menu.Button
                className={classNames(
                  "inline-flex items-center rounded-md py-1 text-sm font-bold",
                  model.provider_id && model.provider_id.length > 0
                    ? "px-0"
                    : "border px-3",
                  readOnly
                    ? "text-gray-300 border-white"
                    : "text-gray-700 border-orange-400",
                  "focus:outline-none focus:ring-0"
                )}
                readOnly={readOnly}
              >
                {model.provider_id && model.provider_id.length > 0 ? (
                  <>
                    {model.provider_id}&nbsp;
                    <ChevronDownIcon className="h-4 w-4 hover:text-gray-700 mt-0.5" />
                  </>
                ) : (
                  "Select provider"
                )}
              </Menu.Button>
            )}
          </div>

          {readOnly ? null : (
            <Menu.Items
              className={classNames(
                "absolute shadow left-1 z-10 mt-1 origin-top-left rounded-md bg-white ring-1 ring-black ring-opacity-5 focus:outline-none",
                model.provider_id && model.provider_id.length > 0
                  ? "-left-4"
                  : "left-1"
              )}
            >
              <div className="py-1">
                {modelProviders.map((p) => {
                  return (
                    <Menu.Item
                      key={p.providerId}
                      onClick={() => {
                        setModels(null);
                        onModelUpdate({
                          provider_id: p.providerId,
                          model_id: "",
                        });
                      }}
                    >
                      {({ active }) => (
                        <span
                          className={classNames(
                            active
                              ? "bg-gray-50 text-gray-900"
                              : "text-gray-700",
                            "block px-4 py-2 text-sm cursor-pointer"
                          )}
                        >
                          {p.providerId}
                        </span>
                      )}
                    </Menu.Item>
                  );
                })}
              </div>
            </Menu.Items>
          )}
        </Menu>
      </div>

      {model.provider_id && model.provider_id.length > 0 ? (
        <div className="flex items-center ml-2">
          {readOnly ? (
            <div className="font-bold text-gray-700 text-sm">
              {(model.model_id && model.model_id.length) > 0
                ? model.model_id
                : ""}
            </div>
          ) : (
            <Menu as="div" className="relative inline-block text-left">
              <div>
                <Menu.Button
                  className={classNames(
                    "inline-flex items-center rounded-md py-1 font-bold text-gray-700 text-sm",
                    model.model_id && model.model_id.length > 0
                      ? "px-0"
                      : "border px-3",
                    readOnly
                      ? "text-gray-300 border-white"
                      : "text-gray-700 border-orange-400",
                    "focus:outline-none focus:ring-0"
                  )}
                  readOnly={readOnly}
                >
                  {model.model_id && model.model_id.length > 0 ? (
                    <>
                      {model.model_id}&nbsp;
                      <ChevronDownIcon className="h-4 w-4 hover:text-gray-700 mt-0.5" />
                    </>
                  ) : (
                    "Select model"
                  )}
                </Menu.Button>
              </div>

              <Menu.Items
                className={classNames(
                  "absolute w-max shadow z-10 mt-1 origin-top-left rounded-md bg-white ring-1 ring-black ring-opacity-5 focus:outline-none",
                  model.model_id && model.model_id.length > 0
                    ? "-left-4"
                    : "left-1"
                )}
              >
                <div className="py-1">
                  {(models || []).map((m) => {
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
                          <span
                            className={classNames(
                              active
                                ? "bg-gray-50 text-gray-900"
                                : "text-gray-700",
                              "block px-4 py-2 text-sm cursor-pointer"
                            )}
                          >
                            {m.id}
                          </span>
                        )}
                      </Menu.Item>
                    );
                  })}
                </div>
              </Menu.Items>
            </Menu>
          )}
        </div>
      ) : (
        <></>
      )}
    </div>
  );
}
