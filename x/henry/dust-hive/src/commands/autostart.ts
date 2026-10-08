import * as p from "@clack/prompts";
import { logger } from "../lib/logger";
import { restoreTerminal } from "../lib/prompt";
import {
  buildAutoStartOverrides,
  CONFIGURABLE_WARM_SERVICES,
  DEFAULT_WARM_SERVICES,
  getWarmServices,
  REQUIRED_WARM_SERVICES,
} from "../lib/registry";
import { Ok, type Result } from "../lib/result";
import { COLD_STATE_SERVICES, type ServiceName } from "../lib/services";
import { loadSettings, type Settings, updateSettings } from "../lib/settings";

interface AutostartOptions {
  list?: boolean;
  reset?: boolean;
}

async function selectWarmServices(current: readonly ServiceName[]): Promise<ServiceName[] | null> {
  const result = await p.multiselect({
    message: "Services started by warm (space to toggle, enter to confirm)",
    initialValues: CONFIGURABLE_WARM_SERVICES.filter((service) => current.includes(service)),
    required: false,
    options: CONFIGURABLE_WARM_SERVICES.map((service) => ({
      value: service,
      label: service,
      ...(DEFAULT_WARM_SERVICES.includes(service) ? { hint: "default" } : {}),
    })),
  });
  restoreTerminal();

  if (p.isCancel(result)) {
    return null;
  }
  return result;
}

function printAutostart(settings: Settings): void {
  const warmServices = getWarmServices(settings);
  const disabled = CONFIGURABLE_WARM_SERVICES.filter((service) => !warmServices.includes(service));
  console.log();
  console.log(`  start:  ${COLD_STATE_SERVICES.join(", ")}`);
  console.log(`  warm:   ${warmServices.join(", ")}`);
  console.log(`  manual: ${disabled.join(", ") || "none"}`);
  console.log();
  console.log(
    `  ${[...COLD_STATE_SERVICES, ...REQUIRED_WARM_SERVICES].join(", ")} always start; toggle the rest with: dust-hive autostart`
  );
  console.log("  Start a manual service with: dust-hive restart [NAME] <service>");
  console.log();
}

export async function autostartCommand(options: AutostartOptions): Promise<Result<void>> {
  if (options.reset) {
    await updateSettings({ autoStartServices: undefined });
    logger.success("Autostart reset to defaults");
    printAutostart(await loadSettings());
    return Ok(undefined);
  }

  const settings = await loadSettings();
  if (options.list || !process.stdin.isTTY) {
    printAutostart(settings);
    return Ok(undefined);
  }

  const selected = await selectWarmServices(getWarmServices(settings));
  if (!selected) {
    logger.info("Cancelled, autostart unchanged");
    return Ok(undefined);
  }

  const overrides = buildAutoStartOverrides(selected);
  await updateSettings({
    autoStartServices: Object.keys(overrides).length > 0 ? overrides : undefined,
  });
  logger.success("Autostart saved (applies on next warm)");
  printAutostart(await loadSettings());
  return Ok(undefined);
}
