import { WebCrawlerHeaderRedactedValue } from "@app/types/connectors/webcrawler";
import { Button, Input, XMarkIcon } from "@dust-tt/sparkle";
import { useFieldArray, useFormContext } from "react-hook-form";

type FormWithCustomHeaders = {
  customHeaders: Array<{ key: string; value: string }>;
};

export function McpServerHeaders() {
  // `register` binds inputs via DOM refs so RHF tracks values natively without triggering React re-renders on each
  // keystroke. Using `update` instead would replace the field object (regenerating field.id), causing React to remount
  // the input on every keystroke and lose focus.
  const { control, register, getValues } =
    useFormContext<FormWithCustomHeaders>();
  const { fields, append, remove } = useFieldArray<
    FormWithCustomHeaders,
    "customHeaders"
  >({
    control,
    name: "customHeaders",
  });

  return (
    <div className="flex w-full flex-col">
      <div className="flex flex-col gap-4">
        {fields.map((field, index) => {
          const isRedacted =
            field.value === WebCrawlerHeaderRedactedValue ||
            getValues(`customHeaders.${index}.value`) ===
              WebCrawlerHeaderRedactedValue;
          return (
            <div key={field.id} className="flex items-center gap-2">
              <div className="grid flex-1 grid-cols-3 gap-2 px-1">
                <div className="col-span-1">
                  <Input
                    {...register(`customHeaders.${index}.key`)}
                    placeholder="Header Name"
                    disabled={isRedacted}
                    className="w-full"
                  />
                </div>
                <div className="col-span-2">
                  <Input
                    {...register(`customHeaders.${index}.value`)}
                    placeholder="Header Value"
                    disabled={isRedacted}
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
          );
        })}
      </div>
      <Button
        className="mt-4"
        variant="outline"
        label="Add Header"
        onClick={() => append({ key: "", value: "" })}
      />
    </div>
  );
}
