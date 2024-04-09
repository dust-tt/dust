import { Spinner2 } from "@dust-tt/sparkle";
import type { EnterpriseUpgradeFormType, WorkspaceType } from "@dust-tt/types";
import { EnterpriseUpgradeFormSchema, removeNulls } from "@dust-tt/types";
import { ioTsResolver } from "@hookform/resolvers/io-ts";
import { useState } from "react";
import type { Control } from "react-hook-form";
import { useForm } from "react-hook-form";

import { PokeButton } from "@app/components/poke/shadcn/ui/button";
import {
  PokeDialog,
  PokeDialogContent,
  PokeDialogDescription,
  PokeDialogFooter,
  PokeDialogHeader,
  PokeDialogTitle,
  PokeDialogTrigger,
} from "@app/components/poke/shadcn/ui/dialog";
import {
  PokeForm,
  PokeFormControl,
  PokeFormField,
  PokeFormItem,
  PokeFormLabel,
  PokeFormMessage,
} from "@app/components/poke/shadcn/ui/form";
import { PokeInput } from "@app/components/poke/shadcn/ui/input";
import {
  PokeSelect,
  PokeSelectContent,
  PokeSelectItem,
  PokeSelectTrigger,
  PokeSelectValue,
} from "@app/components/poke/shadcn/ui/select";
import { usePokePlans } from "@app/lib/swr";

interface SelectFieldOption {
  value: string;
  display?: string;
}

function SelectField({
  control,
  name,
  title,
  options,
}: {
  control: Control<EnterpriseUpgradeFormType>;
  name: keyof EnterpriseUpgradeFormType;
  title?: string;
  options: SelectFieldOption[];
}) {
  return (
    <PokeFormField
      control={control}
      name={name}
      render={({ field }) => (
        <PokeFormItem>
          <PokeFormLabel className="capitalize">{title ?? name}</PokeFormLabel>
          <PokeFormControl>
            <PokeSelect
              onValueChange={field.onChange}
              defaultValue={field.value as string}
            >
              <PokeFormControl>
                <PokeSelectTrigger>
                  <PokeSelectValue placeholder={title ?? name} />
                </PokeSelectTrigger>
              </PokeFormControl>
              <PokeSelectContent>
                <div className="bg-slate-100">
                  {options.map((option) => (
                    <PokeSelectItem key={option.value} value={option.value}>
                      {option.display ? option.display : option.value}
                    </PokeSelectItem>
                  ))}
                </div>
              </PokeSelectContent>
            </PokeSelect>
          </PokeFormControl>
          <PokeFormMessage />
        </PokeFormItem>
      )}
    />
  );
}

function InputField({
  control,
  name,
  title,
  type,
  placeholder,
}: {
  control: Control<EnterpriseUpgradeFormType>;
  name: keyof EnterpriseUpgradeFormType;
  title?: string;
  type?: "text" | "number";
  placeholder?: string;
}) {
  return (
    <PokeFormField
      control={control}
      name={name}
      render={({ field }) => (
        <PokeFormItem>
          <PokeFormLabel className="capitalize">{title ?? name}</PokeFormLabel>
          <PokeFormControl>
            <PokeInput
              placeholder={placeholder ?? name}
              type={type}
              {...field}
              value={field.value}
            />
          </PokeFormControl>
          <PokeFormMessage />
        </PokeFormItem>
      )}
    />
  );
}

export default function EnterpriseUpgradeDialog({
  disabled,
  owner,
}: {
  disabled: boolean;
  owner: WorkspaceType;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const { plans } = usePokePlans();

  const form = useForm<EnterpriseUpgradeFormType>({
    resolver: ioTsResolver(EnterpriseUpgradeFormSchema),
    defaultValues: {
      stripeSubscriptionId: "",
      planCode: "",
    },
  });

  const onSubmit = (values: EnterpriseUpgradeFormType) => {
    const cleanedValues = Object.fromEntries(
      removeNulls(
        Object.entries(values).map(([key, value]) => {
          if (typeof value !== "string") {
            return [key, value];
          }
          const cleanedValue = value.trim();
          if (!cleanedValue) {
            return null;
          }
          return [key, cleanedValue];
        })
      )
    );

    const submit = async () => {
      setIsSubmitting(true);
      setError(null);
      try {
        const r = await fetch(
          `/api/poke/workspaces/${owner.sId}/upgrade_enterprise`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(cleanedValues),
          }
        );

        if (!r.ok) {
          throw new Error(
            `Something went wrong: ${r.status} ${await r.text()}`
          );
        }

        form.reset();
        setOpen(false);
      } catch (e) {
        setIsSubmitting(false);
        if (e instanceof Error) {
          setError(e.message);
        }
      }
    };
    void submit();
  };

  return (
    <PokeDialog open={open} onOpenChange={setOpen}>
      <PokeDialogTrigger asChild>
        <PokeButton variant="outline" disabled={disabled}>
          🏢 Upgrade to Enterprise
        </PokeButton>
      </PokeDialogTrigger>
      <PokeDialogContent className="bg-structure-50 sm:max-w-[425px]">
        <PokeDialogHeader>
          <PokeDialogTitle>Upgrade {owner.name} to Enterprise.</PokeDialogTitle>
          <PokeDialogDescription>
            Select the enterprise plan and provide the Stripe subscription id of
            the customer.
          </PokeDialogDescription>
        </PokeDialogHeader>
        {error && <div className="text-red-500">{error}</div>}
        {isSubmitting && <Spinner2 />}
        {!isSubmitting && (
          <PokeForm {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <div className="grid gap-4 py-4">
                <div className="grid-cols grid items-center gap-4">
                  <SelectField
                    control={form.control}
                    name="planCode"
                    title="Enterprise Plan"
                    options={plans
                      .filter((plan) => plan.code.startsWith("ENT_"))
                      .map((plan) => ({
                        value: plan.code,
                        display: plan.name,
                      }))}
                  />
                </div>
                <div className="grid-cols grid items-center gap-4">
                  <InputField
                    control={form.control}
                    name="stripeSubscriptionId"
                    title="Stripe Subscription id"
                    placeholder="sub_1234567890"
                  />
                </div>
              </div>
              <PokeDialogFooter>
                <PokeButton
                  type="submit"
                  className="border-warning-600 bg-warning-500 text-white"
                >
                  Upgrade
                </PokeButton>
              </PokeDialogFooter>
            </form>
          </PokeForm>
        )}
      </PokeDialogContent>
    </PokeDialog>
  );
}
