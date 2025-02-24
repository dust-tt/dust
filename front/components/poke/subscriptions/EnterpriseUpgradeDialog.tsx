import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Spinner,
} from "@dust-tt/sparkle";
import type { EnterpriseUpgradeFormType, WorkspaceType } from "@dust-tt/types";
import { EnterpriseUpgradeFormSchema, removeNulls } from "@dust-tt/types";
import { ioTsResolver } from "@hookform/resolvers/io-ts";
import { useRouter } from "next/router";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { PokeForm } from "@app/components/poke/shadcn/ui/form";
import {
  InputField,
  SelectField,
} from "@app/components/poke/shadcn/ui/form/fields";
import { isEntreprisePlan } from "@app/lib/plans/plan_codes";
import { usePokePlans } from "@app/lib/swr/poke";

export default function EnterpriseUpgradeDialog({
  owner,
}: {
  owner: WorkspaceType;
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
        router.reload();
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" label="🏢 Upgrade to Enterprise" />
      </DialogTrigger>
      <DialogContent className="bg-structure-50 sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Upgrade {owner.name} to Enterprise.</DialogTitle>
          <DialogDescription>
            Select the enterprise plan and provide the Stripe subscription id of
            the customer.
          </DialogDescription>
        </DialogHeader>
        {error && <div className="text-red-500">{error}</div>}
        {isSubmitting && <Spinner />}
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
                      .filter((plan) => isEntreprisePlan(plan.code))
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
                <Button type="submit" variant="warning" label="Upgrade" />
              </DialogFooter>
            </form>
          </PokeForm>
        )}
      </DialogContent>
    </Dialog>
  );
}
