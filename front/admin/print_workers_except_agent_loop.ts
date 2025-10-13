import { ALL_WORKERS } from "@app/temporal/worker_registry";

// Exclude agent_loop from the list of workers.
console.log(ALL_WORKERS.filter((w) => w !== "agent_loop").join(" "));
