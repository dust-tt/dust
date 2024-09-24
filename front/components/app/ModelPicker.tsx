import { ChevronDownIcon } from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import { Menu } from "@headlessui/react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { filterModelProviders, getProviderLLMModels } from "@app/lib/providers";
import { useProviders } from "@app/lib/swr/apps";
import { classNames } from "@app/lib/utils";

export default function ModelPicker({
  owner,
  model,
  readOnly,
  isAdmin,
  onModelUpdate,
  chatOnly,
  embedOnly,
}: {
  owner: WorkspaceType;
  model: {
    provider_id: string;
    model_id: string;
  };
  readOnly: boolean;
  isAdmin: boolean;
  onModelUpdate: (model: { provider_id: string; model_id: string }) => void;
  chatOnly?: boolean;
  embedOnly?: boolean;
}) {
  const { providers, isProvidersLoading, isProvidersError } = useProviders({
    owner,
    disabled: readOnly,
  });

  const modelProviders = filterModelProviders(
    providers,
    !!chatOnly,
    !!embedOnly
  );

  const [models, setModels] = useState(null as any[] | null);

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
    const provider = providers.find((p) => p.providerId == model.provider_id);
    if (provider) {
      void getProviderLLMModels(
        owner,
        provider.providerId,
        !!chatOnly,
        !!embedOnly
      ).then((m) => {
        if (m.models) {
          setModels(m.models);
        }
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
              isAdmin ? (
                <Link
                  href={`/w/${owner.sId}/developers/providers`}
                  className={classNames(
                    "inline-flex items-center rounded-md py-1 text-sm font-bold",
                    model.provider_id && model.provider_id.length > 0
                      ? "px-1"
                      : "border px-3",
                    readOnly
                      ? "border-white text-gray-300"
                      : "border-orange-400 text-gray-700",
                    "focus:outline-none focus:ring-0"
                  )}
                >
                  {isProvidersLoading ? "Loading..." : "Setup provider"}
                </Link>
              ) : (
                <div
                  className={classNames(
                    "inline-flex items-center rounded-md py-1 text-sm font-normal",
                    "border px-3",
                    "border-white text-gray-300"
                  )}
                >
                  No Provider available
                </div>
              )
            ) : readOnly ? (
              <div className="text-sm font-bold text-gray-700">
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
                    ? "border-white text-gray-300"
                    : "border-orange-400 text-gray-700",
                  "focus:outline-none focus:ring-0"
                )}
              >
                {model.provider_id && model.provider_id.length > 0 ? (
                  <>
                    {model.provider_id}&nbsp;
                    <ChevronDownIcon className="mt-0.5 h-4 w-4 hover:text-gray-700" />
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
                "absolute left-1 z-10 mt-1 origin-top-left rounded-md bg-white shadow-sm ring-1 ring-black ring-opacity-5 focus:outline-none",
                model.provider_id && model.provider_id.length > 0
                  ? "-left-4"
                  : "left-1"
              )}
            >
              <div className="py-1">
                {modelProviders.map((p) => {
                  return (
                    <Menu.Item key={p.providerId}>
                      {({ active }) => (
                        <span
                          className={classNames(
                            active
                              ? "bg-gray-50 text-gray-900"
                              : "text-gray-700",
                            "block cursor-pointer px-4 py-2 text-sm"
                          )}
                          onClick={() => {
                            setModels(null);
                            onModelUpdate({
                              provider_id: p.providerId,
                              model_id: "",
                            });
                          }}
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
        <div className="ml-2 flex items-center">
          {readOnly ? (
            <div className="text-sm font-bold text-gray-700">
              {model.model_id && model.model_id.length > 0
                ? model.model_id
                : ""}
            </div>
          ) : (
            <Menu as="div" className="relative inline-block text-left">
              <div>
                <Menu.Button
                  className={classNames(
                    "inline-flex items-center rounded-md py-1 text-sm font-bold text-gray-700",
                    model.model_id && model.model_id.length > 0
                      ? "px-0"
                      : "border px-3",
                    readOnly
                      ? "border-white text-gray-300"
                      : "border-orange-400 text-gray-700",
                    "focus:outline-none focus:ring-0"
                  )}
                >
                  {model.model_id && model.model_id.length > 0 ? (
                    <>
                      {model.model_id}&nbsp;
                      <ChevronDownIcon className="mt-0.5 h-4 w-4 hover:text-gray-700" />
                    </>
                  ) : (
                    "Select model"
                  )}
                </Menu.Button>
              </div>

              <Menu.Items
                className={classNames(
                  "absolute z-10 mt-1 w-max origin-top-left rounded-md bg-white shadow ring-1 ring-black ring-opacity-5 focus:outline-none",
                  model.model_id && model.model_id.length > 0
                    ? "-left-4"
                    : "left-1"
                )}
              >
                <div className="py-1">
                  {(models || []).map((m) => {
                    return (
                      <Menu.Item key={m.id}>
                        {({ active }) => (
                          <span
                            className={classNames(
                              active
                                ? "bg-gray-50 text-gray-900"
                                : "text-gray-700",
                              "block cursor-pointer px-4 py-2 text-sm"
                            )}
                            onClick={() =>
                              onModelUpdate({
                                provider_id: model.provider_id,
                                model_id: m.id,
                              })
                            }
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
