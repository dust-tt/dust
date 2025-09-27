import { Button, Input, Label, TextArea } from "@dust-tt/sparkle";
import type * as LabelPrimitive from "@radix-ui/react-label";
import { Slot } from "@radix-ui/react-slot";
import * as React from "react";
import type { ControllerProps, FieldPath, FieldValues } from "react-hook-form";
import { Controller, FormProvider, useFormContext } from "react-hook-form";

import { cn } from "@app/components/poke/shadcn/lib/utils";

const Form = FormProvider;

type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
  name: TName;
};

const FormFieldContext = React.createContext<FormFieldContextValue>(
  {} as FormFieldContextValue
);

const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  ...props
}: ControllerProps<TFieldValues, TName>) => {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
};

const useFormField = () => {
  const fieldContext = React.useContext(FormFieldContext);
  const itemContext = React.useContext(FormItemContext);
  const { getFieldState, formState } = useFormContext();

  const fieldState = getFieldState(fieldContext.name, formState);

  if (!fieldContext) {
    throw new Error("useFormField should be used within <FormField>");
  }

  const { id } = itemContext;

  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  };
};

type FormItemContextValue = {
  id: string;
};

const FormItemContext = React.createContext<FormItemContextValue>(
  {} as FormItemContextValue
);

const FormItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const id = React.useId();

  return (
    <FormItemContext.Provider value={{ id }}>
      <div ref={ref} className={cn("space-y-2", className)} {...props} />
    </FormItemContext.Provider>
  );
});
FormItem.displayName = "FormItem";

const FormLabel = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => {
  const { error, formItemId } = useFormField();

  return (
    <Label
      ref={ref}
      className={cn(error && "text-destructive", className)}
      htmlFor={formItemId}
      {...props}
    />
  );
});
FormLabel.displayName = "FormLabel";

const FormControl = React.forwardRef<
  React.ElementRef<typeof Slot>,
  React.ComponentPropsWithoutRef<typeof Slot>
>(({ ...props }, ref) => {
  const { error, formItemId, formDescriptionId, formMessageId } =
    useFormField();

  return (
    <Slot
      ref={ref}
      id={formItemId}
      aria-describedby={
        !error
          ? `${formDescriptionId}`
          : `${formDescriptionId} ${formMessageId}`
      }
      aria-invalid={!!error}
      {...props}
    />
  );
});
FormControl.displayName = "FormControl";

const FormDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => {
  const { formDescriptionId } = useFormField();

  return (
    <p
      ref={ref}
      id={formDescriptionId}
      className={cn(
        "text-sm text-muted-foreground dark:text-muted-foreground-night",
        className
      )}
      {...props}
    />
  );
});
FormDescription.displayName = "FormDescription";

const FormMessage = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, children, ...props }, ref) => {
  const { error, formMessageId } = useFormField();
  const body = error ? String(error?.message) : children;

  if (!body) {
    return null;
  }

  return (
    <p
      ref={ref}
      id={formMessageId}
      className={cn(
        "text-sm font-medium text-warning-500 dark:text-warning-500-night",
        className
      )}
      {...props}
    >
      {body}
    </p>
  );
});
FormMessage.displayName = "FormMessage";

// Override the default input component to add border and background styles.
const FormInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "value"> & {
    value?: React.ComponentProps<typeof Input>["value"];
  }
>(({ className, value, ...props }, ref) => {
  return (
    <Input
      ref={ref}
      className={cn(
        "border-2 border-border-dark dark:border-border-darker-night",
        "bg-white dark:bg-muted-background-night",
        className
      )}
      value={value}
      {...props}
    />
  );
});
FormInput.displayName = "FormInput";

const FormTextArea = React.forwardRef<
  HTMLTextAreaElement,
  Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value"> & {
    value?: React.ComponentProps<typeof TextArea>["value"];
  }
>(({ className, value, ...props }, ref) => {
  return (
    <div ref={ref as React.RefObject<HTMLDivElement>}>
      <TextArea
        className={cn(
          "border-2 border-border-dark dark:border-border-darker-night",
          "bg-white dark:bg-muted-background-night",
          className
        )}
        value={value ?? undefined}
        minRows={2}
        {...props}
      />
    </div>
  );
});
FormTextArea.displayName = "FormTextArea";

const FormUpload = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "value"> & {
    value?: File | null;
  }
>(({ className, value, ...props }, ref) => {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  return (
    <>
      <input
        type="file"
        className="hidden"
        ref={(el) => {
          if (fileInputRef) {
            fileInputRef.current = el;
          }
          if (typeof ref === "function") {
            ref(el);
          } else if (ref) {
            ref.current = el;
          }
        }}
        {...props}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            if (props.onChange) {
              const event = {
                target: {
                  value: file,
                },
              };
              props.onChange(event as any);
            }
          }
        }}
      />
      <div>
        <Button
          className={className}
          variant="outline"
          label={value?.name ?? "Select"}
          onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
            e.preventDefault();
            fileInputRef.current?.click();
          }}
        />
      </div>
    </>
  );
});
FormUpload.displayName = "FormUpload";

export {
  Form as PokeForm,
  FormControl as PokeFormControl,
  FormDescription as PokeFormDescription,
  FormField as PokeFormField,
  FormInput as PokeFormInput,
  FormItem as PokeFormItem,
  FormLabel as PokeFormLabel,
  FormMessage as PokeFormMessage,
  FormTextArea as PokeFormTextArea,
  FormUpload as PokeFormUpload,
};
