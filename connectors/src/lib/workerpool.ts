import workerpool from "workerpool";

let POOL: ReturnType<typeof workerpool.pool> | null = null;
export function getWorkerPool() {
  if (!POOL) {
    POOL = workerpool.pool({ maxWorkers: 3 });
  }
  return POOL;
}
