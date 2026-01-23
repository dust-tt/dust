import { cn } from "@dust-tt/sparkle";
import type { ChangeEvent, ReactNode } from "react";
import type { ControllerFieldState } from "react-hook-form";
import { useController, useFormContext } from "react-hook-form";

interface BaseFormFieldSectionProps<
  E extends HTMLInputElement | HTMLTextAreaElement,
> {
  title?: string;
  titleClassName?: string;
  description?: string;
  helpText?: string;
  headerActions?: ReactNode;
  fieldName: string;
  triggerValidationOnChange?: boolean;
  children: (args: {
    registerRef: (e: E | null) => void;
    registerProps: {
      name: string;
      onBlur: () => void;
      value: string;
    };
    onChange: (e: ChangeEvent<E>) => void;
    errorMessage?: string;
    hasError: boolean;
    fieldState: ControllerFieldState;
  }) => ReactNode;
}

export function BaseFormFieldSection<
  E extends HTMLInputElement | HTMLTextAreaElement,
>({
  title,
  titleClassName,
  description,
  helpText,
  headerActions,
  fieldName,
  triggerValidationOnChange = false,
  children,
}: BaseFormFieldSectionProps<E>) {
  const { trigger } = useFormContext();
  const { field, fieldState } = useController({ name: fieldName });

  const onChange = (e: ChangeEvent<E>) => {
    field.onChange(e);
    if (triggerValidationOnChange) {
      void trigger(fieldName);
    }
  };

  return (
    <div className="space-y-4">
      {(!!title || !!description || !!headerActions) && (
        <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-end">
          <div>
            {title && (
              <h3
                className={cn(
                  "heading-base font-semibold text-foreground dark:text-foreground-night",
                  titleClassName
                )}
              >
                {title}
              </h3>
            )}
            {description && (
              <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                {description}
              </p>
            )}
          </div>
          {headerActions && (
            <div className="flex w-full flex-col gap-2 sm:w-auto">
              <div className="flex items-center gap-2">{headerActions}</div>
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        {children({
          registerRef: field.ref,
          registerProps: {
            name: field.name,
            onBlur: field.onBlur,
            value: field.value ?? "",
          },
          onChange,
          errorMessage: fieldState.error?.message,
          hasError: !!fieldState.error,
          fieldState,
        })}
        {helpText && (
          <p className="text-xs text-muted-foreground dark:text-muted-foreground-night">
            {helpText}
          </p>
        )}
      </div>
    </div>
  );
}
