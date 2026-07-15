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
          label="📅 Edit seat commitments and limit"
          variant="outline"
          size="xs"
        />
      </DialogTrigger>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>Seat commitments and limit</DialogTitle>
          <DialogDescription>
            Configure the seat commitment (billed floor) and max limit over time
            for a seat type. Each line is a phase; leave the end date blank for
            the final, open-ended phase. Scheduled phases are programmed into
            Metronome ahead of time.
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

// Metronome effective dates are whole UTC hours, so the editor's datetime
// fields hold UTC wall-clock time at hour granularity (minutes always "00").
// Convert an ISO instant to the UTC wall-clock value shown in the field.
function toUTCInput(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}:00`
  );
}

// Interpret a UTC wall-clock field value ("YYYY-MM-DDTHH:mm") as a UTC instant
// and return its ISO string.
function utcInputToISO(value: string): string {
  return new Date(`${value}:00Z`).toISOString();
}

// Floor a `datetime-local` value ("YYYY-MM-DDTHH:mm") to the top of the hour.
function floorToHour(value: string): string {
  if (!value) {
    return "";
  }
  return `${value.slice(0, 13)}:00`;
}

// Render a UTC field value in the operator's local time — shown as a hint next
// to each field so the UTC input is unambiguous.
function utcInputToLocalLabel(value: string): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(`${value}:00Z`);
  if (isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function phasesForSeatType(
  schedule: PokeSeatLimitScheduleResponseBody["schedule"],
  seatType: MembershipSeatType
): PhaseForm[] {
  const phases = schedule[seatType] ?? [];
  return phases.map((phase) => ({
    startAt: toUTCInput(phase.startAt),
    endAt: phase.endAt ? toUTCInput(phase.endAt) : "",
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
  // Live values (useFieldArray `fields` only holds the initial snapshot) so the
  // local-time hints track edits.
  const phaseValues = form.watch("phases");

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
        startAt: utcInputToISO(phase.startAt),
        endAt: phase.endAt ? utcInputToISO(phase.endAt) : null,
      });
    }

    // Guard against overlaps and multiple open-ended phases so at most one
    // phase is ever active at a time for this seat type (mirrors the
    // server-side check, for immediate feedback).
    const sorted = [...phases].sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
    );
    for (let i = 0; i < sorted.length; i++) {
      const phase = sorted[i];
      if (
        phase.endAt !== null &&
        new Date(phase.endAt) <= new Date(phase.startAt)
      ) {
        sendNotification({
          title: "Invalid schedule",
          type: "error",
          description: "Each phase's end must be after its start.",
        });
        return;
      }
      if (phase.endAt === null && i !== sorted.length - 1) {
        sendNotification({
          title: "Invalid schedule",
          type: "error",
          description:
            "Only the last phase can be open-ended (blank end date).",
        });
        return;
      }
      if (i > 0) {
        const previous = sorted[i - 1];
        if (
          previous.endAt === null ||
          new Date(previous.endAt) > new Date(phase.startAt)
        ) {
          sendNotification({
            title: "Invalid schedule",
            type: "error",
            description:
              "Phases overlap — two phases would be active at the same time.",
          });
          return;
        }
      }
    }

    setIsSubmitting(true);
    try {
      const ok = await updateSchedule({ seatType, phases: sorted });
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
                  <Button
                    type="button"
                    variant="outline"
                    label={selectedName}
                    isSelect
                  />
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
                      title="Start (UTC)"
                      type="datetime-local"
                      step={3600}
                      transformValue={floorToHour}
                      // Keep phases contiguous: editing a phase's start moves
                      // the previous phase's end to match.
                      onValueChange={(value) => {
                        if (index > 0) {
                          form.setValue(
                            `phases.${index - 1}.endAt`,
                            String(value)
                          );
                        }
                      }}
                    />
                    {utcInputToLocalLabel(
                      phaseValues?.[index]?.startAt ?? ""
                    ) && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Local:{" "}
                        {utcInputToLocalLabel(
                          phaseValues?.[index]?.startAt ?? ""
                        )}
                      </p>
                    )}
                  </div>
                  <div className="w-52">
                    <InputField
                      control={form.control}
                      name={`phases.${index}.endAt`}
                      title="End (UTC, blank = open-ended)"
                      type="datetime-local"
                      step={3600}
                      transformValue={floorToHour}
                      // Keep phases contiguous: editing a phase's end moves the
                      // next phase's start to match.
                      onValueChange={(value) => {
                        if (index < fields.length - 1) {
                          form.setValue(
                            `phases.${index + 1}.startAt`,
                            String(value)
                          );
                        }
                      }}
                    />
                    {utcInputToLocalLabel(
                      phaseValues?.[index]?.endAt ?? ""
                    ) && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Local:{" "}
                        {utcInputToLocalLabel(
                          phaseValues?.[index]?.endAt ?? ""
                        )}
                      </p>
                    )}
                  </div>
                  <div className="w-28">
                    <InputField
                      control={form.control}
                      name={`phases.${index}.minSeats`}
                      title="Commitment"
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
                    type="button"
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
                type="button"
                variant="outline"
                size="xs"
                label="Add phase"
                onClick={() =>
                  append({
                    startAt: toUTCInput(new Date().toISOString()),
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
