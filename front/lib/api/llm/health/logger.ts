import logger from "@app/logger/logger";

/**
 * Everything the model health breaker logs, under one field.
 *
 * Its lines are spread across detection on the request path and the recovery
 * workflow's probes -- two services, two levels, and in `client.ts` a line with
 * only a `workflowId` to go on. `component` is what collects them into one
 * Datadog view and gives a monitor something to group by; the message strings
 * are not a stable enough key for either.
 */
export const healthLogger = logger.child({ component: "model_health" });
