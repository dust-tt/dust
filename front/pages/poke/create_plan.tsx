import { Spinner2 } from "@dust-tt/sparkle";
import type {
  EnterpriseSubscriptionFormType,
  WorkspaceType,
} from "@dust-tt/types";
import { EnterpriseSubscriptionFormSchema, removeNulls } from "@dust-tt/types";
import { ioTsResolver } from "@hookform/resolvers/io-ts";
import { useRouter } from "next/router";
import React from "react";
import type { Control } from "react-hook-form";
import { useForm } from "react-hook-form";

import PokeNavbar from "@app/components/poke/PokeNavbar";
import { PokeButton } from "@app/components/poke/shadcn/ui/button";
import { PokeCheckbox } from "@app/components/poke/shadcn/ui/checkbox";
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
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";

export const getServerSideProps = withSuperUserAuthRequirements<{
  owner: WorkspaceType;
}>(async (context, auth) => {
  const owner = auth.workspace();
  if (!owner) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner,
    },
  };
});

export default function EnterpriseSubscriptionForm({
  owner,
}: {
  owner: WorkspaceType;
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const form = useForm<EnterpriseSubscriptionFormType>({
    resolver: ioTsResolver(EnterpriseSubscriptionFormSchema),
    defaultValues: {
      stripeSubscriptionId: "",
      code: "",
      name: "",
      isSlackbotAllowed: true,
      isSlackAllowed: true,
      isNotionAllowed: true,
      isGoogleDriveAllowed: true,
      isGithubAllowed: true,
      isIntercomAllowed: true,
      isConfluenceAllowed: true,
      isWebCrawlerAllowed: true,
      maxMessages: -1,
      maxMessagesTimeframe: "lifetime",
      dataSourcesCount: -1,
      dataSourcesDocumentsCount: -1,
      dataSourcesDocumentsSizeMb: 2,
      maxUsers: 1000,
    },
  });

  const onSubmit = (values: EnterpriseSubscriptionFormType) => {
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
        void router.push(`/poke/${owner.sId}`);
      } catch (e) {
        setIsSubmitting(false);
        if (e instanceof Error) {
          setError(e.message);
        }
      }
    };
    void submit();
  };

  if (Object.keys(form.formState.errors).length > 0) {
    // Useful to debug in case you have an error on a field that is not rendered
    console.log("Form errors", form.formState.errors);
  }

  return (
    <div className="min-h-screen bg-structure-50 pb-48">
      <PokeNavbar />
      <div className="mx-auto h-full max-w-2xl flex-grow flex-col items-center justify-center pt-8">
        <PokeForm {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <InputField
              control={form.control}
              name="stripeSubscriptionId"
              title="Stripe Subscription id"
              placeholder="sub_1234567890"
            />
            <InputField
              control={form.control}
              name="code"
              title="Plan Code"
              placeholder="ENT_Soupinou_MAU10_FLOOR500"
            />
            <InputField
              control={form.control}
              name="name"
              title="Plan Name (user facing)"
              placeholder="Soupinou Corp"
            />
            <CheckboxField
              control={form.control}
              name="isSlackbotAllowed"
              title="Is Slackbot allowed?"
            />
            <CheckboxField
              control={form.control}
              name="isSlackAllowed"
              title="Is Slack connection allowed?"
            />
            <CheckboxField
              control={form.control}
              name="isNotionAllowed"
              title="Is Notion connection allowed?"
            />
            <CheckboxField
              control={form.control}
              name="isGoogleDriveAllowed"
              title="Is Google Drive connection allowed?"
            />
            <CheckboxField
              control={form.control}
              name="isGithubAllowed"
              title="Is Github connection allowed?"
            />
            <CheckboxField
              control={form.control}
              name="isIntercomAllowed"
              title="Is Intercom connection allowed?"
            />
            <CheckboxField
              control={form.control}
              name="isConfluenceAllowed"
              title="Is Confluence connection allowed?"
            />
            <CheckboxField
              control={form.control}
              name="isWebCrawlerAllowed"
              title="Is Web Crawler connection allowed?"
            />
            <InputField
              control={form.control}
              name="maxMessages"
              title="Max messages"
              type="number"
              placeholder="1000"
            />
            <SelectField
              control={form.control}
              name="maxMessagesTimeframe"
              title="Max messages timeframe"
              options={[
                { value: "lifetime", display: "Lifetime" },
                { value: "day", display: "Per day" },
              ]}
            />
            <InputField
              control={form.control}
              name="dataSourcesCount"
              title="Data sources count"
              type="number"
              placeholder="10"
            />
            <InputField
              control={form.control}
              name="dataSourcesDocumentsCount"
              title="Data sources documents count"
              type="number"
              placeholder="100"
            />
            <InputField
              control={form.control}
              name="dataSourcesDocumentsSizeMb"
              title="Data sources documents size (MB)"
              type="number"
              placeholder="2"
            />
            <InputField
              control={form.control}
              name="maxUsers"
              title="Max users"
              type="number"
              placeholder="1000"
            />
            <PokeButton type="submit" variant="outline">
              {isSubmitting && <Spinner2 size="sm" />} Submit
            </PokeButton>

            {error && <div className="text-red-500">{error}</div>}
          </form>
        </PokeForm>
      </div>
    </div>
  );
}

function InputField({
  control,
  name,
  title,
  type,
  placeholder,
}: {
  control: Control<EnterpriseSubscriptionFormType>;
  name: keyof EnterpriseSubscriptionFormType;
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
              value={
                typeof field.value === "boolean"
                  ? field.value.toString()
                  : field.value
              }
            />
          </PokeFormControl>
          <PokeFormMessage />
        </PokeFormItem>
      )}
    />
  );
}

function CheckboxField({
  control,
  name,
  title,
}: {
  control: Control<EnterpriseSubscriptionFormType>;
  name: keyof EnterpriseSubscriptionFormType;
  title?: string;
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
            <PokeCheckbox
              checked={!!field.value}
              onCheckedChange={field.onChange}
            />
          </PokeFormControl>
          <PokeFormMessage />
        </PokeFormItem>
      )}
    />
  );
}

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
  control: Control<EnterpriseSubscriptionFormType>;
  name: keyof EnterpriseSubscriptionFormType;
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
