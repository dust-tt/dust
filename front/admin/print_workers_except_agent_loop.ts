import { ALL_WORKERS } from "@app/temporal/worker_registry";

// Exclude the agent loop pools from the list of workers.
console.log(ALL_WORKERS.filter((w) => !w.startsWith("agent_loop")).join(" "));
