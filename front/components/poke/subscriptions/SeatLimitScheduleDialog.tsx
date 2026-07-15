import { PokeForm } from "@app/components/poke/shadcn/ui/form";
import { InputField } from "@app/components/poke/shadcn/ui/form/fields";
import { useSendNotification } from "@app/hooks/useNotification";
import type { SeatPlanResponseBody } from "@app/lib/api/credits/seat_plan";
import type {
  PokeSeatLimitScheduleResponseBody,
  SeatLimitScheduleInputPhase,
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
  IconButton,
  Spinner,
  Trash01,
} from "@dust-tt/sparkle";
import { Fragment, useState } from "react";
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
            for a seat type. Each line is a phase that runs from its start until
            the next phase begins; the last phase is open-ended. Scheduled
            phases are programmed into Metronome ahead of time.
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

// The default start for a new (non-first) phase: one day after the previous
// phase's start, keeping the whole-hour UTC alignment.
function addOneDayUTCInput(value: string): string {
  const date = new Date(`${value}:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return toUTCInput(date.toISOString());
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
    minSeats: phase.minSeats,
    maxSeats: phase.maxSeats ?? undefined,
  }));
}

function phasesEqual(a: PhaseForm[], b: PhaseForm[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Convert the form's phases for one seat type into the API payload, validating
// as we go. Returns either the payload or a human-readable error.
function buildInputPhases(
  phases: PhaseForm[]
): { phases: SeatLimitScheduleInputPhase[] } | { error: string } {
  const result: SeatLimitScheduleInputPhase[] = [];
  for (const phase of phases) {
    if (!phase.startAt) {
      return { error: "Every phase needs a start date." };
    }
    result.push({
      minSeats: Number(phase.minSeats) || 0,
      maxSeats:
        phase.maxSeats === undefined || Number.isNaN(phase.maxSeats)
          ? null
          : Number(phase.maxSeats),
      startAt: utcInputToISO(phase.startAt),
    });
  }
  // Two phases can't share a start (end dates are derived from the ordering).
  if (new Set(result.map((phase) => phase.startAt)).size !== result.length) {
    return { error: "Two phases can't start at the same time." };
  }
  return { phases: result };
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
  // In-progress edits per seat type, kept while switching between seat types so
  // nothing is lost until the whole schedule is saved.
  const [drafts, setDrafts] = useState<
    Partial<Record<MembershipSeatType, PhaseForm[]>>
  >({});

  const phasesFor = (type: MembershipSeatType): PhaseForm[] =>
    drafts[type] ?? phasesForSeatType(schedule, type);

  const form = useForm<ScheduleFormValues>({
    defaultValues: {
      phases: seatType ? phasesFor(seatType) : [],
    },
  });
  const { fields, replace } = useFieldArray({
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
    if (next === seatType) {
      return;
    }
    // Stash the current seat type's edits before loading the next one.
    setDrafts((prev) => ({ ...prev, [seatType]: form.getValues("phases") }));
    replace(phasesFor(next));
    setSeatType(next);
  };

  const handleAddPhase = () => {
    const current = form.getValues("phases");
    // First phase starts now (floored to the hour); each later phase defaults
    // to the day after the previous one. End dates are derived server-side, so
    // there is nothing else to keep in sync here.
    const startAt =
      current.length === 0
        ? toUTCInput(new Date().toISOString())
        : addOneDayUTCInput(current[current.length - 1].startAt);
    replace([...current, { startAt, minSeats: 0 }]);
  };

  const handleRemovePhase = (index: number) => {
    const current = form.getValues("phases");
    replace(current.filter((_, i) => i !== index));
  };

  const onSubmit = async (values: ScheduleFormValues) => {
    // Merge the seat type currently being edited into the stashed drafts, then
    // save every seat type whose schedule actually changed from the server.
    const allDrafts: Partial<Record<MembershipSeatType, PhaseForm[]>> = {
      ...drafts,
      [seatType]: values.phases,
    };
    const toSave: {
      seatType: MembershipSeatType;
      phases: SeatLimitScheduleInputPhase[];
    }[] = [];
    for (const [type, phases] of Object.entries(allDrafts)) {
      if (!isMembershipSeatType(type) || !phases) {
        continue;
      }
      if (phasesEqual(phases, phasesForSeatType(schedule, type))) {
        continue;
      }
      const built = buildInputPhases(phases);
      if ("error" in built) {
        sendNotification({
          title: `Invalid schedule for '${type}'`,
          type: "error",
          description: built.error,
        });
        return;
      }
      toSave.push({ seatType: type, phases: built.phases });
    }

    if (toSave.length === 0) {
      await onSaved();
      return;
    }

    setIsSubmitting(true);
    try {
      for (const entry of toSave) {
        const ok = await updateSchedule(entry);
        if (!ok) {
          // The hook already surfaced the error; stop so nothing is lost.
          return;
        }
      }
      await onSaved();
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

            {fields.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No phases configured for this seat type.
              </div>
            ) : (
              // Table-like grid: one header row, then a row per phase. Cells are
              // top-aligned so the Start field's local-time hint hangs below
              // without pushing the other columns down.
              <div className="grid grid-cols-[minmax(0,1fr)_7rem_7rem_auto] items-start gap-x-3 gap-y-2">
                <div className="text-xs font-semibold text-muted-foreground">
                  Start (UTC)
                </div>
                <div className="text-xs font-semibold text-muted-foreground">
                  Commitment
                </div>
                <div className="text-xs font-semibold text-muted-foreground">
                  Max
                </div>
                <div />
                {fields.map((field, index) => (
                  <Fragment key={field.id}>
                    <div>
                      <InputField
                        control={form.control}
                        name={`phases.${index}.startAt`}
                        hideLabel
                        type="datetime-local"
                        step={3600}
                        transformValue={floorToHour}
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
                    <InputField
                      control={form.control}
                      name={`phases.${index}.minSeats`}
                      hideLabel
                      type="number"
                      min="0"
                    />
                    <InputField
                      control={form.control}
                      name={`phases.${index}.maxSeats`}
                      hideLabel
                      type="number"
                      min="1"
                      placeholder="∞"
                    />
                    <IconButton
                      icon={Trash01}
                      size="xs"
                      variant="outline"
                      onClick={() => handleRemovePhase(index)}
                    />
                  </Fragment>
                ))}
              </div>
            )}

            <div>
              <Button
                type="button"
                variant="outline"
                size="xs"
                label="Add phase"
                onClick={handleAddPhase}
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
