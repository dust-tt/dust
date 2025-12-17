import type { ChangeEvent, ReactNode } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { useController, useFormContext } from "react-hook-form";

interface BaseFormFieldSectionProps<
  E extends HTMLInputElement | HTMLTextAreaElement,
> {
  title?: string;
  description?: string;
  helpText?: string;
  headerActions?: ReactNode;
  fieldName: string;
  triggerValidationOnChange?: boolean;
  children: (args: {
    registerRef: (e: E | null) => void;
    registerProps: Omit<UseFormRegisterReturn, "onChange" | "ref">;
    onChange: (e: ChangeEvent<E>) => void;
    errorMessage?: string;
    hasError: boolean;
  }) => ReactNode;
}

export function BaseFormFieldSection<
  E extends HTMLInputElement | HTMLTextAreaElement,
>({
  title,
  description,
  helpText,
  headerActions,
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
      {(!!title || !!description || !!headerActions) && (
        <div className="flex flex-col items-end justify-between gap-2 sm:flex-row">
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
          {headerActions && (
            <div className="flex w-full flex-col gap-2 sm:w-auto">
              <div className="flex items-center gap-2">{headerActions}</div>
            </div>
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
