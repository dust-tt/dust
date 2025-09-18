import type { ChangeEvent } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { useController, useFormContext } from "react-hook-form";

interface BaseFormFieldSectionProps<
  E extends HTMLInputElement | HTMLTextAreaElement,
> {
  title?: string;
  description?: string;
  helpText?: string;
  fieldName: string;
  triggerValidationOnChange?: boolean;
  children: (args: {
    registerRef: (e: E | null) => void;
    registerProps: Omit<UseFormRegisterReturn, "onChange" | "ref">;
    onChange: (e: ChangeEvent<E>) => void;
    errorMessage?: string;
    hasError: boolean;
  }) => React.ReactNode;
}

export function BaseFormFieldSection<
  E extends HTMLInputElement | HTMLTextAreaElement,
>({
  title,
  description,
  helpText,
  fieldName,
  triggerValidationOnChange = false,
  children,
}: BaseFormFieldSectionProps<E>) {
  const { register, trigger } = useFormContext();
  const { fieldState } = useController({ name: fieldName });

  const {
    ref: registerRef,
    onChange: registerOnChange,
    ...restRegisterProps
  } = register(fieldName);

  const registerRefCallback = (e: E | null) => {
    // The ref provided by react-hook-form accepts any instance; providing E | null is safe.
    registerRef(e);
  };

  const registerProps: Omit<UseFormRegisterReturn, "onChange" | "ref"> =
    restRegisterProps;

  const onChange = (e: ChangeEvent<E>) => {
    void registerOnChange?.(e);
    if (triggerValidationOnChange) {
      void trigger(fieldName);
    }
  };

  return (
    <div className="space-y-4">
      {(!!title || !!description) && (
        <div>
          {title && (
            <h3 className="heading-base font-semibold text-foreground dark:text-foreground-night">
              {title}
            </h3>
          )}
          {description && (
            <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              {description}
            </p>
          )}
        </div>
      )}

      <div className="space-y-2">
        {children({
          registerRef: registerRefCallback,
          registerProps,
          onChange,
          errorMessage: fieldState.error?.message,
          hasError: !!fieldState.error,
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
