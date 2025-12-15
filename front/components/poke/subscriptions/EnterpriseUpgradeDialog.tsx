import {
  Button,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Spinner,
} from "@dust-tt/sparkle";
import { ioTsResolver } from "@hookform/resolvers/io-ts";
import { useRouter } from "next/router";
import { useCallback, useState } from "react";
import { useForm } from "react-hook-form";

import { PokeForm } from "@app/components/poke/shadcn/ui/form";
import {
  InputField,
  SelectField,
} from "@app/components/poke/shadcn/ui/form/fields";
import { clientFetch } from "@app/lib/egress/client";
import { isEntreprisePlanPrefix } from "@app/lib/plans/plan_codes";
import { usePokePlans } from "@app/lib/swr/poke";
import type { EnterpriseUpgradeFormType, WorkspaceType } from "@app/types";
import { EnterpriseUpgradeFormSchema, removeNulls } from "@app/types";

export default function EnterpriseUpgradeDialog({
  owner,
  hasProgrammaticUsageConfig,
}: {
  owner: WorkspaceType;
  hasProgrammaticUsageConfig: boolean;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const { plans } = usePokePlans();
  const router = useRouter();

  const form = useForm<EnterpriseUpgradeFormType>({
    resolver: ioTsResolver(EnterpriseUpgradeFormSchema),
    defaultValues: {
      stripeSubscriptionId: "",
      planCode: "",
    },
  });

  const onSubmit = useCallback(
    (values: EnterpriseUpgradeFormType) => {
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
          const r = await clientFetch(
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
          router.reload();
        } catch (e) {
          setIsSubmitting(false);
          if (e instanceof Error) {
            setError(e.message);
          }
        }
      };
      void submit();
    },
    [form, owner.sId, router, setError, setIsSubmitting, setOpen]
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" label="🏢 Upgrade to Enterprise" />
      </DialogTrigger>
      <DialogContent className="bg-primary-50 dark:bg-primary-50-night sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Upgrade {owner.name} to Enterprise.</DialogTitle>
          <DialogDescription>
            Select the enterprise plan and provide the Stripe subscription id of
            the customer.
          </DialogDescription>
        </DialogHeader>
        <DialogContainer>
          {!hasProgrammaticUsageConfig && (
            <div className="mb-4 rounded-md border border-warning-200 bg-warning-100 p-3 text-warning-800">
              Programmatic usage configuration must be set before upgrading to
              enterprise. Please use the "Manage Programmatic Usage
              Configuration" plugin first.
            </div>
          )}
          {error && <div className="text-warning">{error}</div>}
          {isSubmitting && (
            <div className="flex justify-center">
              <Spinner size="lg" />
            </div>
          )}
          {!isSubmitting && (
            <PokeForm {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-8"
              >
                <div className="grid gap-4 py-4">
                  <div className="grid-cols grid items-center gap-4">
                    <SelectField
                      control={form.control}
                      name="planCode"
                      title="Enterprise Plan"
                      options={plans
                        .filter((plan) => isEntreprisePlanPrefix(plan.code))
                        .map((plan) => ({
                          value: plan.code,
                          display: `${plan.name} (${plan.code})`,
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
                <DialogFooter>
                  <Button
                    type="submit"
                    variant="warning"
                    label="Upgrade"
                    disabled={!hasProgrammaticUsageConfig}
                  />
                </DialogFooter>
              </form>
            </PokeForm>
          )}
        </DialogContainer>
      </DialogContent>
    </Dialog>
  );
}
