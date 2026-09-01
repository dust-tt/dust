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
  Plus,
} from "@dust-tt/sparkle";
import { useState } from "react";

interface NewPlanWarningDialogProps {
  disabled: boolean;
  onConfirm: () => void;
}

/**
 * Gate in front of "Create a new plan": every plan added here is shared by every
 * workspace subscribed to it and has to be maintained forever, so a negotiated
 * exception should almost always be a per-workspace override instead.
 */
export function NewPlanWarningDialog({
  disabled,
  onConfirm,
}: NewPlanWarningDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          icon={Plus}
          label="Create a new plan"
          variant="outline"
          disabled={disabled}
        />
      </DialogTrigger>
      <DialogContent className="bg-primary-50 sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>Avoid creating a new plan</DialogTitle>
          <DialogDescription>
            Plan limits exist for a reason: they push customers toward the next
            tier (Business, Enterprise) and keep the platform in a sane state.
            Every new plan is one more thing to maintain forever, and it is
            shared by every workspace subscribed to it.
          </DialogDescription>
        </DialogHeader>
        <DialogContainer>
          <div className="flex flex-col gap-3 text-sm text-muted-foreground">
            <p>
              If a specific limit has been negotiated for one customer, prefer
              subscribing them to an existing plan and overriding just that
              limit on their workspace:
            </p>
            <ul className="flex flex-col gap-2 pl-5">
              <li className="list-disc">
                <span className="font-semibold">SSO / SCIM</span> — use the{" "}
                <span className="font-semibold">Override Plan Limits</span> poke
                plugin on the workspace.
              </li>
              <li className="list-disc">
                <span className="font-semibold">
                  Number of seats (# Users, # Free, # Free LT)
                </span>{" "}
                — use the{" "}
                <span className="font-semibold">Override Plan Limits</span> poke
                plugin on the workspace.
              </li>
              <li className="list-disc">
                <span className="font-semibold">
                  Number of spaces, data sources and connections
                </span>{" "}
                — same{" "}
                <span className="font-semibold">Override Plan Limits</span>{" "}
                plugin.
              </li>
            </ul>
            <p>
              Overrides are workspace-scoped, survive plan changes, and are
              visible in the workspace's "Plan limitations" tab. If the limit
              you need is not overridable yet, adding it there is usually a
              better move than adding a plan.
            </p>
          </div>
        </DialogContainer>
        <DialogFooter>
          <Button
            variant="outline"
            label="Cancel"
            onClick={() => setOpen(false)}
          />
          <Button
            variant="warning"
            label="I understand, create a plan"
            onClick={() => {
              setOpen(false);
              onConfirm();
            }}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
