import { PokeForm } from "@app/components/poke/shadcn/ui/form";
import { InputField } from "@app/components/poke/shadcn/ui/form/fields";
import { useSendNotification } from "@app/hooks/useNotification";
import { useRunPokePlugin } from "@app/poke/swr/plugins";
import type { WorkspaceType } from "@app/types/user";
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
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const GRANT_USER_FREE_CREDITS_PLUGIN_ID = "grant-user-free-credits";

const GrantFreeCreditsFormSchema = z.object({
  amountCredits: z
    .number({ invalid_type_error: "Enter a number of credits" })
    .int("Amount must be a whole number of credits")
    .positive("Amount must be greater than 0"),
});

type GrantFreeCreditsFormType = z.infer<typeof GrantFreeCreditsFormSchema>;

interface GrantFreeCreditsButtonProps {
  owner: WorkspaceType;
  userId: string;
  memberName: string;
  // Called after a successful grant so callers can refresh their data.
  onGranted?: () => void;
}

export function GrantFreeCreditsButton({
  owner,
  userId,
  memberName,
  onGranted,
}: GrantFreeCreditsButtonProps) {
  const sendNotification = useSendNotification();
  const [open, setOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  const form = useForm<GrantFreeCreditsFormType>({
    resolver: zodResolver(GrantFreeCreditsFormSchema),
    defaultValues: { amountCredits: undefined },
  });

  const { doRunPlugin } = useRunPokePlugin({
    pluginId: GRANT_USER_FREE_CREDITS_PLUGIN_ID,
    pluginResourceTarget: {
      resourceType: "workspaces",
      resourceId: owner.sId,
      workspace: owner,
    },
  });

  const onSubmit = async (values: GrantFreeCreditsFormType) => {
    setIsRunning(true);
    const result = await doRunPlugin({
      userId,
      amountCredits: values.amountCredits,
      confirm: true,
    });
    setIsRunning(false);

    if (result.isErr()) {
      sendNotification({
        type: "error",
        title: "Failed to grant free credits",
        description: result.error,
      });
      return;
    }

    sendNotification({
      type: "success",
      title: "Free credits granted",
      description:
        result.value.display === "text"
          ? result.value.value
          : `Granted free credits to ${memberName}.`,
    });
    form.reset();
    setOpen(false);
    onGranted?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="xs" label="Free credits" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Grant free credits</DialogTitle>
          <DialogDescription>
            Add free AWU credits to {memberName}'s free-seat balance. No invoice
            is generated.
          </DialogDescription>
        </DialogHeader>
        <DialogContainer>
          <PokeForm {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <InputField
                control={form.control}
                name="amountCredits"
                title="Amount (AWU credits)"
                type="number"
                min="1"
                step={1}
                placeholder="e.g. 500"
              />
              <DialogFooter>
                <Button
                  type="submit"
                  variant="warning"
                  label="Grant"
                  isLoading={isRunning}
                />
              </DialogFooter>
            </form>
          </PokeForm>
        </DialogContainer>
      </DialogContent>
    </Dialog>
  );
}
