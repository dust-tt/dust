import { readFileSync } from "node:fs";
import Module from "node:module";
import { performance } from "node:perf_hooks";

// `Module.prototype._compile` is the hook every module goes through; @types/node
// does not declare it, so it is narrowed here rather than cast.
interface CompilingModule {
  _compile(content: string, filename: string): unknown;
}

function isCompilingModule(value: object): value is CompilingModule {
  return (
    "_compile" in value &&
    typeof (value as { _compile: unknown })._compile === "function"
  );
}

let modules: number | undefined;
let moduleBytes = 0;

// Counting every module compile means patching a Node internal, so it stays
// behind a flag: set FRONT_API_BOOT_PROFILE=1 on a pod to find out what its
// boot is loading. The wall/CPU split below is free and always reported.
if (
  process.env.FRONT_API_BOOT_PROFILE === "1" &&
  isCompilingModule(Module.prototype)
) {
  modules = 0;
  const proto = Module.prototype;
  const originalCompile = proto._compile;
  proto._compile = function (this: CompilingModule, ...args) {
    modules = (modules ?? 0) + 1;
    moduleBytes += args[0]?.length ?? 0;
    return originalCompile.apply(this, args);
  };
}

function readProcNumber(path: string, key: string): number | undefined {
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const [name, value] = line.split(":");
      if (name?.trim() === key) {
        return Number(value.trim());
      }
    }
  } catch {
    // Not on Linux, or the field is unavailable: the caller omits it.
  }
  return undefined;
}

/**
 * Boot cost of this process, logged once the server is listening.
 *
 * `offCpuMs` is the part of the boot spent waiting rather than computing. On a
 * streamed image layer that is the per-file fetch cost, which grows with the
 * number of modules the boot touches.
 */
export function getBootProfile() {
  const wallMs = Math.round(performance.now());
  const cpu = process.cpuUsage();
  const cpuMs = Math.round((cpu.user + cpu.system) / 1000);
  const usage = process.resourceUsage();

  return {
    nodeBootstrapMs: Math.round(performance.nodeTiming.bootstrapComplete),
    wallMs,
    cpuMs,
    offCpuMs: wallMs - cpuMs,
    maxRssMb: Math.round(usage.maxRSS / 1024),
    majorPageFaults: usage.majorPageFault,
    diskReadBytes: readProcNumber("/proc/self/io", "read_bytes"),
    modules,
    moduleMb:
      modules === undefined ? undefined : Math.round(moduleBytes / 1048576),
  };
}
