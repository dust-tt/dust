import { createHash } from "node:crypto";

import config from "@app/lib/api/config";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { z } from "zod";

/**
 * Fetches the Frame runtime types artifact Viz generates at build time (see
 * viz/app/lib/frame-runtime-types/build.ts) so Frame UI source can be type-checked in the
 * publishing sandbox against the exact modules and package versions the renderer exposes.
 *
 * Viz is contacted at most once per minute, whether the last attempt succeeded or failed, and
 * the tarball is only downloaded when its id changes. Fetch failures fall back to the last
 * artifact this process fetched, or to `null` when there is none, so a Viz outage degrades type
 * checking instead of blocking publication or stalling every publish on a fetch timeout.
 */

const MANIFEST_CHECK_INTERVAL_MS = 60_000;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_TARBALL_BYTES = 64 * 1024 * 1024;

const SHA256_HEX = /^[0-9a-f]{64}$/;

// Mirrors FrameRuntimeTypesManifest in viz/app/lib/frame-runtime-types/build.ts.
const FrameRuntimeTypesManifestSchema = z.object({
  version: z.literal(1),
  id: z.string().regex(SHA256_HEX),
  path: z.string().regex(/^\/frame-runtime\/[0-9a-f]{64}\.tgz$/),
  tarballSha256: z.string().regex(SHA256_HEX),
  sizeBytes: z.number().int().positive().max(MAX_TARBALL_BYTES),
});

export interface FrameRuntimeTypesArtifact {
  id: string;
  tarball: Buffer;
  tarballSha256: string;
}

interface ArtifactCache {
  artifact: FrameRuntimeTypesArtifact | null;
  manifestCheckedAtMs: number;
  inflight: Promise<FrameRuntimeTypesArtifact | null> | null;
}

let cache: ArtifactCache = {
  artifact: null,
  manifestCheckedAtMs: 0,
  inflight: null,
};

async function fetchFromViz(urlPath: string): Promise<Result<Response, Error>> {
  const baseUrl = config.getVizPublicUrl().replace(/\/$/, "");
  try {
    const response = await fetch(`${baseUrl}${urlPath}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      return new Err(
        new Error(`GET ${urlPath} failed with status ${response.status}.`)
      );
    }
    return new Ok(response);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}

async function fetchLatestArtifact(
  current: FrameRuntimeTypesArtifact | null
): Promise<Result<FrameRuntimeTypesArtifact, Error>> {
  const manifestResponse = await fetchFromViz("/frame-runtime/manifest.json");
  if (manifestResponse.isErr()) {
    return manifestResponse;
  }

  let manifestBody: unknown;
  try {
    manifestBody = await manifestResponse.value.json();
  } catch (error) {
    return new Err(normalizeError(error));
  }
  const manifest = FrameRuntimeTypesManifestSchema.safeParse(manifestBody);
  if (!manifest.success) {
    return new Err(
      new Error(
        `Invalid Frame runtime types manifest: ${manifest.error.message}`
      )
    );
  }
  if (current?.id === manifest.data.id) {
    return new Ok(current);
  }

  const tarballResponse = await fetchFromViz(manifest.data.path);
  if (tarballResponse.isErr()) {
    return tarballResponse;
  }
  let tarball: Buffer;
  try {
    tarball = Buffer.from(await tarballResponse.value.arrayBuffer());
  } catch (error) {
    return new Err(normalizeError(error));
  }
  if (tarball.byteLength > MAX_TARBALL_BYTES) {
    return new Err(
      new Error(
        `Frame runtime types tarball exceeds ${MAX_TARBALL_BYTES} bytes.`
      )
    );
  }
  const tarballSha256 = createHash("sha256").update(tarball).digest("hex");
  if (tarballSha256 !== manifest.data.tarballSha256) {
    return new Err(
      new Error("Frame runtime types tarball does not match its manifest.")
    );
  }

  return new Ok({ id: manifest.data.id, tarball, tarballSha256 });
}

async function refreshArtifact(): Promise<FrameRuntimeTypesArtifact | null> {
  const previous = cache.artifact;
  const latest = await fetchLatestArtifact(previous);
  if (latest.isErr()) {
    logger.warn(
      { err: latest.error, cachedArtifactId: previous?.id ?? null },
      "Frame runtime types artifact unavailable; Frame UI type checking uses the cached artifact if any"
    );
    cache = { ...cache, manifestCheckedAtMs: Date.now() };
    return previous;
  }

  if (latest.value !== previous) {
    logger.info(
      {
        artifactId: latest.value.id,
        sizeBytes: latest.value.tarball.byteLength,
      },
      "Fetched Frame runtime types artifact"
    );
  }
  cache = {
    ...cache,
    artifact: latest.value,
    manifestCheckedAtMs: Date.now(),
  };

  return latest.value;
}

/** The current Frame runtime types artifact, or null when none could be fetched. */
export async function getFrameRuntimeTypesArtifact(): Promise<FrameRuntimeTypesArtifact | null> {
  if (Date.now() - cache.manifestCheckedAtMs < MANIFEST_CHECK_INTERVAL_MS) {
    return cache.artifact;
  }
  if (cache.inflight) {
    return cache.inflight;
  }

  const inflight = refreshArtifact().finally(() => {
    cache = { ...cache, inflight: null };
  });
  cache = { ...cache, inflight };

  return inflight;
}

export function resetFrameRuntimeTypesArtifactCacheForTests(): void {
  cache = { artifact: null, manifestCheckedAtMs: 0, inflight: null };
}
