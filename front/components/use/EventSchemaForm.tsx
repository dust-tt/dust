import {
  ArrowUpOnSquareIcon,
  Button,
  IconButton,
  PageHeader,
  SectionHeader,
  XCircleIcon,
} from "@dust-tt/sparkle";
import { PlusIcon } from "@heroicons/react/24/outline";
import { useRouter } from "next/router";
import React, { useState } from "react";

import { APIError } from "@app/lib/error";
import { useEventSchemas } from "@app/lib/swr";
import { classNames } from "@app/lib/utils";
import {
  eventSchemaPropertyAllTypes,
  EventSchemaType,
} from "@app/types/extract";
import { WorkspaceType } from "@app/types/user";

type EventSchemaPropertyType = {
  name: string;
  type: string;
  description: string;
};

export function ExtractEventSchemaForm({
  owner,
  schema,
  readOnly = false,
}: {
  owner: WorkspaceType;
  schema?: EventSchemaType;
  readOnly: boolean;
}) {
  const { schemas } = useEventSchemas(owner);

  const [marker, setMarker] = useState<string>(schema?.marker || "");
  const [description, setDescription] = useState<string>(
    schema?.description || ""
  );
  const [properties, setProperties] = useState<EventSchemaPropertyType[]>(
    schema ? schema.properties : []
  );

  const [errorMarker, setErrorMarker] = useState<string>("");
  const [errorDescription, setErrorDescription] = useState<string>("");
  const [errorProperties, setErrorProperties] = useState<string>("");

  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const router = useRouter();

  const handleFormValidation = (): boolean => {
    let isFormValid = true;
    if (!marker) {
      isFormValid = false;
      setErrorMarker("Marker is mandatory.");
    }
    if (!description) {
      isFormValid = false;
      setErrorDescription("Description is mandatory.");
    }
    if (properties.length === 0) {
      isFormValid = false;
      setErrorProperties("A template must contain at least one property.");
    }
    const hasEmptyProperties = properties.some(
      (property: EventSchemaPropertyType) =>
        !property.name || !property.type || !property.description
    );
    if (hasEmptyProperties) {
      isFormValid = false;
      setErrorProperties("All 3 fields are mandatory for each property added.");
    }
    if (!schema) {
      const markerAlreadyUsed = schemas.some(
        (schema) => schema.marker === marker
      );
      if (markerAlreadyUsed) {
        isFormValid = false;
        setErrorMarker(
          "This marker is already used, please pick a different one!"
        );
      }
    }
    return isFormValid;
  };

  const handleCreate = async () => {
    setIsProcessing(true);
    const res = await fetch(`/api/w/${owner.sId}/use/extract/templates`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ marker, description, properties }),
    });
    if (res.ok) {
      setIsProcessing(false);
      await router.push(`/w/${owner.sId}/u/extract`);
    } else {
      const err = (await res.json()) as { error: APIError };
      setIsProcessing(false);
      window.alert(`Error creating Template: ${err.error.message}`);
    }
  };

  const handleUpdate = async () => {
    if (!schema?.marker) {
      // todo: error
      return;
    }
    setIsProcessing(true);
    const res = await fetch(
      `/api/w/${owner.sId}/use/extract/templates/${schema.sId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ marker, description, properties }),
      }
    );
    if (res.ok) {
      setIsProcessing(false);
      await router.push(`/w/${owner.sId}/u/extract`);
    } else {
      const err = (await res.json()) as { error: APIError };
      setIsProcessing(false);
      window.alert(`Error creating Template: ${err.error.message}`);
    }
  };

  const onSubmit = async () => {
    const isFormValid = handleFormValidation();
    if (!isFormValid) {
      return;
    }
    if (schema) {
      await handleUpdate();
      return;
    }
    await handleCreate();
  };

  return (
    <>
      <PageHeader
        title="Extract"
        icon={ArrowUpOnSquareIcon}
        description="Extract is your go-to tool for capturing structured data
        effortlessly within your notes. Use Extract markers to specify sections in your notes that you want to revisit or analyze. No more scrolling and searching!"
      />
      <div>
        <SectionHeader
          title="Define the data to extract"
          description="Define your marker and the properties you want to extract from your notes. The description fields are sent to the LLM to help it understand what you want to extract. If you want to extract the summary of a discussion, you could define a property named 'summary' with the description 'Extract the summary of the discussion'."
        />

        {/* Form */}
        <div className="mt-6">
          <div className=" grid grid-cols-1 gap-x-4 gap-y-6 pt-6 sm:grid-cols-6">
            <TextField
              name="marker"
              label="Marker"
              description={
                marker
                  ? `Current marker is [[${marker}]].`
                  : "This will be the marker used in your docs to trigger the extraction."
              }
              value={marker}
              onChange={(e) => {
                setErrorMarker("");
                setMarker(e.target.value);
              }}
              error={errorMarker}
              disabled={readOnly}
              className="sm:col-span-2"
            />
            <TextField
              name="description"
              label="Description"
              description='Could be "Extract the meeting notes from a Slack discussion" for a [[meeting_notes]] marker.'
              value={description}
              onChange={(e) => {
                setErrorDescription("");
                setDescription(e.target.value);
              }}
              error={errorDescription}
              disabled={readOnly}
              className="sm:col-span-4"
            />
          </div>

          <div className="mt-6 grid grid-cols-12 gap-x-4 gap-y-6 pt-6 sm:grid-cols-12">
            <PropertiesFields
              properties={properties}
              setProperties={setProperties}
              error={errorProperties}
              setError={setErrorProperties}
              readOnly={readOnly}
            />
          </div>

          {/* Submit */}
          <div className="col-span-6 sm:col-span-2"></div>
          <div className="col-span-6 flex justify-end sm:col-span-4">
            <Button
              type="primary"
              label={isProcessing ? "Submitting..." : "Submit"}
              disabled={isProcessing || readOnly}
              onClick={async () => {
                await onSubmit();
              }}
            />
            <Button
              onClick={() => router.push(`/w/${owner.sId}/u/extract`)}
              label="Cancel"
              type="secondary"
            />
          </div>
        </div>
      </div>
    </>
  );
}

function TextField({
  name,
  label,
  description,
  value,
  onChange,
  error,
  disabled,
  className = "",
}: {
  name: string;
  label: string;
  description?: string;
  value?: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error?: string;
  disabled?: boolean;
  className: string;
}) {
  return (
    <div className={classNames(className, disabled ? "text-gray-400" : "")}>
      <div className="flex justify-between">
        <label
          htmlFor={name}
          className="block text-sm font-medium text-gray-700"
        >
          {label}
        </label>
      </div>
      <div className="mt-1 flex rounded-md shadow-sm">
        <input
          type="text"
          name={name}
          id={name}
          className={classNames(
            "block w-full min-w-0 flex-1 rounded-md text-sm",
            error
              ? "border-red-500 focus:ring-red-500"
              : "border-gray-300 focus:border-violet-500 focus:ring-violet-500"
          )}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      </div>
      {description && (
        <p className="mt-2 text-sm text-gray-500">{description}</p>
      )}
      {error && <p className="text-sm font-bold text-red-400">{error}</p>}
    </div>
  );
}

function PropertiesFields({
  properties,
  setProperties,
  error,
  setError,
  readOnly,
}: {
  properties: EventSchemaPropertyType[];
  setProperties: (properties: EventSchemaPropertyType[]) => void;
  error: string;
  setError: (message: string) => void;
  readOnly?: boolean;
}) {
  function handlePropertyChange(
    index: number,
    field: "name" | "type" | "description",
    value: string
  ) {
    const newProperties = [...properties];
    newProperties[index][field] = value;
    setProperties(newProperties);
  }

  function addProperty() {
    const newProperties = [...properties];
    newProperties.push({
      name: "",
      type: "string",
      description: "",
    });
    setProperties(newProperties);
  }

  function removeProperty(index: number) {
    const newProperties = [...properties];
    newProperties.splice(index, 1);
    setProperties(newProperties);
  }

  return (
    <>
      {properties.map(
        (
          prop: { name: string; type: string; description: string },
          index: number
        ) => (
          <React.Fragment key={index}>
            <TextField
              name={`name-${index}`}
              label="Property"
              value={prop["name"]}
              onChange={(e) => {
                setError("");
                handlePropertyChange(index, "name", e.target.value);
              }}
              disabled={readOnly}
              className="sm:col-span-2"
            />
            <div className="sm:col-span-2">
              <div className="flex justify-between">
                <label
                  htmlFor={`type-${index}`}
                  className="block text-sm font-medium text-gray-700"
                >
                  Type
                </label>
              </div>
              <div className="mt-1 flex rounded-md shadow-sm">
                <select
                  name={`type-${index}`}
                  id={`type-${index}`}
                  className={classNames(
                    "w-full rounded-md border-gray-300 text-sm focus:border-violet-500 focus:ring-violet-500",
                    readOnly ? "text-gray-400" : ""
                  )}
                  onChange={(e) => {
                    setError("");
                    handlePropertyChange(index, "type", e.target.value);
                  }}
                >
                  {eventSchemaPropertyAllTypes.map((option) => (
                    <option
                      key={option}
                      value={option}
                      selected={option === prop["type"]}
                      disabled={readOnly && option !== prop["type"]}
                    >
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <TextField
              name={`description-${index}`}
              label="Description"
              value={prop["description"]}
              onChange={(e) => {
                setError("");
                handlePropertyChange(index, "description", e.target.value);
              }}
              disabled={readOnly}
              className="col-span-7"
            />
            <div className="col-span-1 flex items-end">
              <IconButton
                icon={XCircleIcon}
                tooltip="Remove Property"
                type="tertiary"
                onClick={async () => {
                  removeProperty(index);
                }}
                className="ml-1"
              />
            </div>
          </React.Fragment>
        )
      )}
      {error && (
        <p className="text-sm font-bold text-red-400 sm:col-span-6">{error}</p>
      )}
      <div className="sm:col-span-12">
        <Button
          label={
            properties.length
              ? "Add another property"
              : "Define what to extract!"
          }
          icon={PlusIcon}
          onClick={addProperty}
          disabled={readOnly}
        />
      </div>
    </>
  );
}
