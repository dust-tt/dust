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
import { useState } from "react";
import { useForm } from "react-hook-form";

import { PokeForm } from "@app/components/poke/shadcn/ui/form";
import {
  InputField,
  SelectField,
} from "@app/components/poke/shadcn/ui/form/fields";
import { isFreePlan } from "@app/lib/plans/plan_codes";
import { usePokePlans } from "@app/lib/swr/poke";
import type { FreePlanUpgradeFormType, WorkspaceType } from "@app/types";
import { FreePlanUpgradeFormSchema, removeNulls } from "@app/types";

export default function FreePlanUpgradeDialog({
  owner,
}: {
  owner: WorkspaceType;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const { plans } = usePokePlans();
  const router = useRouter();

  const form = useForm<FreePlanUpgradeFormType>({
    resolver: ioTsResolver(FreePlanUpgradeFormSchema),
    defaultValues: {
      planCode: "",
      endDate: undefined,
    },
  });

  const onSubmit = (values: FreePlanUpgradeFormType) => {
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
        const r = await fetch(`/api/poke/workspaces/${owner.sId}/upgrade`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(cleanedValues),
        });

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
        <Button variant="outline" label="🙌🏻 Upgrade to a Free Plan" />
      </DialogTrigger>
      <DialogContent className="bg-primary-50 dark:bg-primary-50-night sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Upgrade {owner.name} to a Free Plan.</DialogTitle>
          <DialogDescription>
            Select the free plan and provide the end date (optional) of the free
            plan. If you select the same plan as the current plan, we will only
            update the end date that you provide.
          </DialogDescription>
        </DialogHeader>
        <DialogContainer>
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
                      title="Free Plan"
                      options={plans
                        .filter((plan) => isFreePlan(plan.code))
                        .map((plan) => ({
                          value: plan.code,
                          display: `${plan.name} (${plan.code})`,
                        }))}
                    />
                  </div>
                  <div className="grid-cols grid items-center gap-4">
                    <InputField
                      control={form.control}
                      name="endDate"
                      title="End Date"
                      placeholder="Optional, will downgrade to no plan after this date if set. Format: YYYY-MM-DD"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" variant="warning" label="Upgrade" />
                </DialogFooter>
              </form>
            </PokeForm>
          )}
        </DialogContainer>
      </DialogContent>
    </Dialog>
  );
}
