/**
 * Arm, disarm, or inspect the synthetic failure model used to exercise
 * the model-health breaker.
 *
 *   npx tsx scripts/simulated_failure_model.ts --action status
 *   npx tsx scripts/simulated_failure_model.ts --action enable --ttlSeconds 300 --execute
 *   npx tsx scripts/simulated_failure_model.ts --action disable --execute
 */
import {
  getSimulatedFailureModelStatus,
  SIMULATED_FAILURE_MODEL_MAX_TTL_SECONDS,
  seedSimulatedFailureModelHealthWindow,
  setSimulatedFailureModelFailure,
} from "@app/lib/api/llm/simulated_failure_model";
import { makeScript } from "@app/scripts/helpers";
import { assertNever } from "@app/types/shared/utils/assert_never";

const ACTIONS = ["enable", "disable", "status"] as const;
type Action = (typeof ACTIONS)[number];

function isAction(value: string): value is Action {
  return (ACTIONS as readonly string[]).includes(value);
}

makeScript(
  {
    action: {
      type: "string" as const,
      choices: ACTIONS,
      demandOption: true,
      describe: "enable arms a failing run, disable disarms, status inspects",
    },
    ttlSeconds: {
      type: "number" as const,
      default: 5 * 60,
      describe: "How long the armed failure stays live (enable only)",
    },
  },
  async ({ action, ttlSeconds, execute }, logger) => {
    if (!isAction(action)) {
      throw new Error(`Unknown action, possible values: ${ACTIONS.join(", ")}`);
    }

    switch (action) {
      case "status": {
        logger.info(
          await getSimulatedFailureModelStatus(),
          "Simulated failure model status"
        );
        return;
      }

      case "enable": {
        if (
          !Number.isInteger(ttlSeconds) ||
          ttlSeconds < 1 ||
          ttlSeconds > SIMULATED_FAILURE_MODEL_MAX_TTL_SECONDS
        ) {
          throw new Error(
            `--ttlSeconds must be an integer between 1 and ${SIMULATED_FAILURE_MODEL_MAX_TTL_SECONDS}`
          );
        }

        const status = await getSimulatedFailureModelStatus();
        if (status.degradation === "lease") {
          throw new Error(
            "The simulated failure model is still in recovery; wait for its lease to clear before starting another run."
          );
        }
        // The streams already route around a degraded model, so a run would
        // never reach the synthetic endpoint to fail in the first place.
        if (status.degradation === "permanent") {
          throw new Error(
            "The simulated failure model is flagged degraded in `model_degradations`; clear that row before starting a run."
          );
        }

        if (!execute) {
          logger.info(
            { requestedTtlSeconds: ttlSeconds, ...status },
            "Would arm the simulated failure model"
          );
          return;
        }

        // Disarm an earlier incomplete run before replacing its health window.
        await setSimulatedFailureModelFailure({
          enabled: false,
          ttlSeconds: 1,
        });
        await seedSimulatedFailureModelHealthWindow();
        await setSimulatedFailureModelFailure({ enabled: true, ttlSeconds });
        logger.info(
          await getSimulatedFailureModelStatus(),
          "Armed simulated failure model"
        );
        return;
      }

      case "disable": {
        if (!execute) {
          logger.info(
            await getSimulatedFailureModelStatus(),
            "Would disarm the simulated failure model"
          );
          return;
        }

        await setSimulatedFailureModelFailure({
          enabled: false,
          ttlSeconds: 1,
        });
        logger.info(
          await getSimulatedFailureModelStatus(),
          "Disarmed simulated failure model"
        );
        return;
      }

      default:
        assertNever(action);
    }
  }
);
