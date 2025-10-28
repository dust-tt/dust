import type { FieldValues, UseFormReturn } from "react-hook-form";
import { FormProvider as ReactHookFromProvider } from "react-hook-form";

interface FormProviderProps<TFormData extends FieldValues> {
  children: React.ReactNode;
  form: UseFormReturn<TFormData>;
  onSubmit?: (data: TFormData) => void | Promise<void>;
  className?: string;
}

// You are not supposed to have nested forms. If you want to have multiple forms,
// like one in main layout, another one in dialog, make sure to use portal
// for sub forms, so that we won't have nested forms. Also note that even if you use portal,
// events will still propagate according to the React tree rather than the DOM tree.
export function FormProvider<TFormData extends FieldValues>({
  children,
  form,
  onSubmit,
  className,
}: FormProviderProps<TFormData>) {
  const handleSubmit = async (data: TFormData) => {
    if (onSubmit) {
      await onSubmit(data);
    }
  };

  // You have to call stopPropagation inside `onSubmit`, it's too late
  // if you handle it inside `handleSubmit`.
  return (
    <ReactHookFromProvider {...form}>
      <form
        className={className}
        onSubmit={(e) => {
          e.stopPropagation();
          e.preventDefault();
          void form.handleSubmit(handleSubmit)(e);
        }}
      >
        {children}
      </form>
    </ReactHookFromProvider>
  );
}
