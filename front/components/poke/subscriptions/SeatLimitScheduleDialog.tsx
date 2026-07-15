import { PokeForm } from "@app/components/poke/shadcn/ui/form";
import { InputField } from "@app/components/poke/shadcn/ui/form/fields";
import { useSendNotification } from "@app/hooks/useNotification";
import type { SeatPlanResponseBody } from "@app/lib/api/credits/seat_plan";
import type {
  PokeSeatLimitScheduleResponseBody,
  SeatLimitSchedulePhase,
} from "@app/lib/api/poke/seat_limits_schedule";
import {
  usePokeSeatLimitSchedule,
  useUpdatePokeSeatLimitSchedule,
} from "@app/poke/swr/seat_limits_schedule";
import type { MembershipSeatType } from "@app/types/memberships";
import { isMembershipSeatType } from "@app/types/memberships";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Spinner,
} from "@dust-tt/sparkle";
import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";

interface SeatLimitScheduleDialogProps {
  owner: WorkspaceType;
  seatPlan: SeatPlanResponseBody | null;
}

export default function SeatLimitScheduleDialog({
  owner,
  seatPlan,
}: SeatLimitScheduleDialogProps) {
  const [open, setOpen] = useState(false);
  const { schedule, isLoading, mutate } = usePokeSeatLimitSchedule({
    owner,
    disabled: !open,
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          label="📅 Edit seat-limit schedule"
          variant="outline"
          size="xs"
        />
      </DialogTrigger>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>Seat-limit schedule</DialogTitle>
          <DialogDescription>
            Configure the committed min / max seats over time for a seat type.
            Each line is a phase; leave the end date blank for the final,
            open-ended phase. Scheduled phases are programmed into Metronome
            ahead of time.
          </DialogDescription>
        </DialogHeader>
        {open && isLoading ? (
          <DialogContainer>
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          </DialogContainer>
        ) : (
          <ScheduleEditor
            owner={owner}
            seatPlan={seatPlan}
            schedule={schedule ?? {}}
            onSaved={async () => {
              await mutate();
              setOpen(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface PhaseForm {
  startAt: string;
  endAt: string;
  minSeats: number;
  maxSeats?: number;
}

interface ScheduleFormValues {
  phases: PhaseForm[];
}

function toLocalInput(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

function phasesForSeatType(
  schedule: PokeSeatLimitScheduleResponseBody["schedule"],
  seatType: MembershipSeatType
): PhaseForm[] {
  const phases = schedule[seatType] ?? [];
  return phases.map((phase) => ({
    startAt: toLocalInput(phase.startAt),
    endAt: phase.endAt ? toLocalInput(phase.endAt) : "",
    minSeats: phase.minSeats,
    maxSeats: phase.maxSeats ?? undefined,
  }));
}

interface ScheduleEditorProps {
  owner: WorkspaceType;
  seatPlan: SeatPlanResponseBody | null;
  schedule: PokeSeatLimitScheduleResponseBody["schedule"];
  onSaved: () => Promise<void>;
}

function ScheduleEditor({
  owner,
  seatPlan,
  schedule,
  onSaved,
}: ScheduleEditorProps) {
  const sendNotification = useSendNotification();
  const updateSchedule = useUpdatePokeSeatLimitSchedule({ owner });

  // Seat types configurable on this contract, with their display names.
  const seatTypeOptions = Object.entries(seatPlan ?? {}).flatMap(
    ([seatType, info]) =>
      isMembershipSeatType(seatType) && info
        ? [{ seatType, name: info.name }]
        : []
  );

  const [seatType, setSeatType] = useState<MembershipSeatType | null>(
    seatTypeOptions[0]?.seatType ?? null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<ScheduleFormValues>({
    defaultValues: {
      phases: seatType ? phasesForSeatType(schedule, seatType) : [],
    },
  });
  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "phases",
  });

  if (seatTypeOptions.length === 0 || !seatType) {
    return (
      <DialogContainer>
        <div className="text-sm text-muted-foreground">
          No configurable seat types on this contract.
        </div>
      </DialogContainer>
    );
  }

  const selectedName =
    seatTypeOptions.find((o) => o.seatType === seatType)?.name ?? seatType;

  const onSelectSeatType = (next: MembershipSeatType) => {
    setSeatType(next);
    replace(phasesForSeatType(schedule, next));
  };

  const onSubmit = async (values: ScheduleFormValues) => {
    const phases: SeatLimitSchedulePhase[] = [];
    for (const phase of values.phases) {
      if (!phase.startAt) {
        sendNotification({
          title: "Invalid schedule",
          type: "error",
          description: "Every phase needs a start date.",
        });
        return;
      }
      phases.push({
        minSeats: Number(phase.minSeats) || 0,
        maxSeats:
          phase.maxSeats === undefined || Number.isNaN(phase.maxSeats)
            ? null
            : Number(phase.maxSeats),
        startAt: new Date(phase.startAt).toISOString(),
        endAt: phase.endAt ? new Date(phase.endAt).toISOString() : null,
      });
    }

    setIsSubmitting(true);
    try {
      const ok = await updateSchedule({ seatType, phases });
      if (ok) {
        await onSaved();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <DialogContainer>
        <PokeForm {...form}>
          <form
            id="seat-limit-schedule-form"
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-1">
              <div className="text-sm font-semibold">Seat type</div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" label={selectedName} isSelect />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {seatTypeOptions.map((option) => (
                    <DropdownMenuItem
                      key={option.seatType}
                      label={option.name}
                      onClick={() => onSelectSeatType(option.seatType)}
                    />
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="flex flex-col gap-3">
              {fields.length === 0 && (
                <div className="text-sm text-muted-foreground">
                  No phases configured for this seat type.
                </div>
              )}
              {fields.map((field, index) => (
                <div
                  key={field.id}
                  className="flex items-end gap-2 rounded-lg border p-3"
                >
                  <div className="w-52">
                    <InputField
                      control={form.control}
                      name={`phases.${index}.startAt`}
                      title="Start"
                      type="datetime-local"
                    />
                  </div>
                  <div className="w-52">
                    <InputField
                      control={form.control}
                      name={`phases.${index}.endAt`}
                      title="End (blank = open-ended)"
                      type="datetime-local"
                    />
                  </div>
                  <div className="w-24">
                    <InputField
                      control={form.control}
                      name={`phases.${index}.minSeats`}
                      title="Min"
                      type="number"
                      min="0"
                    />
                  </div>
                  <div className="w-24">
                    <InputField
                      control={form.control}
                      name={`phases.${index}.maxSeats`}
                      title="Max (blank = ∞)"
                      type="number"
                      min="1"
                    />
                  </div>
                  <Button
                    variant="warning"
                    size="xs"
                    label="Remove"
                    onClick={() => remove(index)}
                  />
                </div>
              ))}
            </div>

            <div>
              <Button
                variant="outline"
                size="xs"
                label="Add phase"
                onClick={() =>
                  append({
                    startAt: toLocalInput(new Date().toISOString()),
                    endAt: "",
                    minSeats: 0,
                  })
                }
              />
            </div>
          </form>
        </PokeForm>
      </DialogContainer>
      <DialogFooter>
        <Button
          type="submit"
          form="seat-limit-schedule-form"
          label={isSubmitting ? "Saving…" : "Save schedule"}
          disabled={isSubmitting}
        />
      </DialogFooter>
    </>
  );
}
