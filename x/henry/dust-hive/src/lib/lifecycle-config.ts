import { rename, unlink } from "node:fs/promises";
import { z } from "zod";
import { LIFECYCLE_CONFIG_PATH } from "./paths";
import { CommandError, Err, Ok, type Result } from "./result";

const NullableDurationSecondsSchema = z.number().int().positive().nullable();

const LifecyclePolicySchema = z
  .object({
    coldAfterSeconds: NullableDurationSecondsSchema.default(60 * 60),
    stopAfterSeconds: NullableDurationSecondsSchema.default(8 * 60 * 60),
    deleteAfterSeconds: NullableDurationSecondsSchema.default(7 * 24 * 60 * 60),
    trackSourceChanges: z.boolean().default(true),
    trackFrontend: z.boolean().default(true),
    blockDeleteIfSessionExists: z.boolean().default(false),
  })
  .strict();

const LifecyclePolicyOverridesSchema = LifecyclePolicySchema.partial();

const LifecycleEnrollmentSchema = z
  .object({
    profile: z.string().min(1),
    overrides: LifecyclePolicyOverridesSchema.optional(),
  })
  .strict();

const LifecycleConfigFileSchema = z
  .object({
    scanIntervalSeconds: z.number().int().min(5).default(30),
    dryRun: z.boolean().default(false),
    profiles: z.record(z.string(), LifecyclePolicySchema).default({}),
    environments: z.record(z.string(), LifecycleEnrollmentSchema).default({}),
  })
  .strict();

export type LifecyclePolicy = z.infer<typeof LifecyclePolicySchema>;
export type LifecyclePolicyOverrides = z.infer<typeof LifecyclePolicyOverridesSchema>;
export type LifecycleEnrollment = z.infer<typeof LifecycleEnrollmentSchema>;
export type LifecycleConfig = z.infer<typeof LifecycleConfigFileSchema>;

export const DEFAULT_LIFECYCLE_PROFILE = "balanced";

const BUILT_IN_PROFILES: Record<string, LifecyclePolicy> = {
  [DEFAULT_LIFECYCLE_PROFILE]: LifecyclePolicySchema.parse({}),
};

function defaultLifecycleConfig(): LifecycleConfig {
  return {
    scanIntervalSeconds: 30,
    dryRun: false,
    profiles: BUILT_IN_PROFILES,
    environments: {},
  };
}

export async function loadLifecycleConfig(): Promise<Result<LifecycleConfig, CommandError>> {
  const file = Bun.file(LIFECYCLE_CONFIG_PATH);
  if (!(await file.exists())) {
    return Ok(defaultLifecycleConfig());
  }

  let data: unknown;
  try {
    data = await file.json();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Err(new CommandError(`Invalid lifecycle config: ${message}`));
  }

  const parsed = LifecycleConfigFileSchema.safeParse(data);
  if (!parsed.success) {
    return Err(new CommandError(`Invalid lifecycle config: ${z.prettifyError(parsed.error)}`));
  }

  return Ok({
    ...parsed.data,
    profiles: { ...BUILT_IN_PROFILES, ...parsed.data.profiles },
  });
}

export async function saveLifecycleConfig(config: LifecycleConfig): Promise<void> {
  const parsed = LifecycleConfigFileSchema.parse(config);
  const temporaryPath = `${LIFECYCLE_CONFIG_PATH}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    await Bun.write(temporaryPath, JSON.stringify(parsed, null, 2));
    await rename(temporaryPath, LIFECYCLE_CONFIG_PATH);
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
}

export function resolveLifecyclePolicy(
  config: LifecycleConfig,
  enrollment: LifecycleEnrollment
): Result<LifecyclePolicy, CommandError> {
  const profile = config.profiles[enrollment.profile];
  if (!profile) {
    return Err(new CommandError(`Unknown lifecycle profile '${enrollment.profile}'`));
  }

  const parsed = LifecyclePolicySchema.safeParse({ ...profile, ...enrollment.overrides });
  if (!parsed.success) {
    return Err(new CommandError(`Invalid lifecycle policy: ${z.prettifyError(parsed.error)}`));
  }

  return Ok(parsed.data);
}

export function parseDurationSeconds(value: string): Result<number | null, CommandError> {
  if (value === "never" || value === "off") {
    return Ok(null);
  }

  const match = /^(\d+)(s|m|h|d|w)$/.exec(value);
  if (!match) {
    return Err(
      new CommandError(`Invalid duration '${value}'. Use values such as 30m, 8h, 7d, or never.`)
    );
  }

  const amount = Number.parseInt(match[1] ?? "", 10);
  const unit = match[2];
  const multiplierByUnit: Record<string, number> = {
    s: 1,
    m: 60,
    h: 60 * 60,
    d: 24 * 60 * 60,
    w: 7 * 24 * 60 * 60,
  };
  const multiplier = unit ? multiplierByUnit[unit] : undefined;
  if (amount <= 0 || multiplier === undefined) {
    return Err(new CommandError(`Invalid duration '${value}'`));
  }

  return Ok(amount * multiplier);
}

export function formatDurationSeconds(durationSeconds: number | null): string {
  if (durationSeconds === null) {
    return "never";
  }

  const units = [
    { suffix: "w", seconds: 7 * 24 * 60 * 60 },
    { suffix: "d", seconds: 24 * 60 * 60 },
    { suffix: "h", seconds: 60 * 60 },
    { suffix: "m", seconds: 60 },
  ];
  for (const unit of units) {
    if (durationSeconds % unit.seconds === 0) {
      return `${durationSeconds / unit.seconds}${unit.suffix}`;
    }
  }

  return `${durationSeconds}s`;
}
