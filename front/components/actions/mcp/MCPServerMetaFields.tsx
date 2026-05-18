import type { MetaRow } from "@app/types/shared/utils/http_headers";
import { Button, Input, XMarkIcon } from "@dust-tt/sparkle";
import { useFieldArray, useFormContext } from "react-hook-form";

type FormWithMetaFields = {
  metaFields: MetaRow[];
};

export function MCPServerMetaFields() {
  const { control, register } = useFormContext<FormWithMetaFields>();
  const { fields, append, remove } = useFieldArray<
    FormWithMetaFields,
    "metaFields"
  >({
    control,
    name: "metaFields",
  });

  return (
    <div className="flex w-full flex-col">
      <div className="flex flex-col gap-4">
        {fields.map((field, index) => (
          <div key={field.id} className="flex items-center gap-2">
            <div className="grid flex-1 grid-cols-3 gap-2 px-1">
              <div className="col-span-1">
                <Input
                  {...register(`metaFields.${index}.key`)}
                  placeholder="Key"
                  className="w-full"
                />
              </div>
              <div className="col-span-2">
                <Input
                  {...register(`metaFields.${index}.value`)}
                  placeholder="Value"
                  className="w-full"
                />
              </div>
            </div>
            <Button
              variant="outline"
              icon={XMarkIcon}
              onClick={() => remove(index)}
            />
          </div>
        ))}
      </div>
      <Button
        className="mt-4"
        variant="outline"
        label="Add Meta Field"
        onClick={() => append({ key: "", value: "" })}
      />
    </div>
  );
}
