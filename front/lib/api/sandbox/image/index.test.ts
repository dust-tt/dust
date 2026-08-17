import {
  createToolManifest,
  devSandboxImageId,
  formatSandboxImageId,
  getSandboxImage,
  getSandboxImageFromRegistry,
  getToolsForProvider,
  toolManifestToYAML,
} from "@app/lib/api/sandbox/image";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { afterEach, describe, expect, it, vi } from "vitest";

const DEV_SUFFIX = "test-dev";

function releaseImageId() {
  const imageResult = getSandboxImageFromRegistry({ name: "dust-base" });
  if (imageResult.isErr()) {
    throw imageResult.error;
  }
  const { imageId } = imageResult.value;
  if (!imageId) {
    throw new Error("dust-base is not registered");
  }
  return imageId;
}

describe("dev sandbox image alias", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("namespaces the release tag so the two aliases never collide", () => {
    const release = releaseImageId();
    const dev = devSandboxImageId(release, DEV_SUFFIX);

    expect(dev.imageName).toBe(release.imageName);
    expect(dev.tag).toBe(`${release.tag}-${DEV_SUFFIX}`);
    expect(formatSandboxImageId(dev)).not.toBe(formatSandboxImageId(release));
    // E2B only accepts lowercase alphanumerics, hyphens and our `_` separator.
    expect(formatSandboxImageId(dev)).toMatch(/^[a-z0-9-]+_[a-z0-9-]+$/);
  });

  it("keeps the release alias when no suffix is configured", () => {
    const release = releaseImageId();

    // The common local setup: no image of your own, run what CI published.
    expect(devSandboxImageId(release, undefined)).toEqual(release);
    expect(devSandboxImageId(release, "")).toEqual(release);
  });

  it("resolves the dev alias in development when a suffix is set", () => {
    vi.stubEnv("IS_DEVELOPMENT", "true");
    vi.stubEnv("SBX_DEV_IMAGE_SUFFIX", DEV_SUFFIX);

    const imageResult = getSandboxImage();
    if (imageResult.isErr()) {
      throw imageResult.error;
    }

    expect(imageResult.value.imageId?.tag).toBe(
      `${releaseImageId().tag}-${DEV_SUFFIX}`
    );
  });

  it("keeps the release alias outside development even when a suffix is set", () => {
    vi.stubEnv("SBX_DEV_IMAGE_SUFFIX", DEV_SUFFIX);

    const imageResult = getSandboxImage();
    if (imageResult.isErr()) {
      throw imageResult.error;
    }

    expect(imageResult.value.imageId?.tag).toBe(releaseImageId().tag);
  });
});

describe("getToolsForProvider", () => {
  it("filters dsbx from manifest inputs when requested", async () => {
    const { authenticator: auth } = await createResourceTest({});

    const hiddenToolsResult = getToolsForProvider(auth, "openai", {
      includeDsbxTools: false,
    });
    expect(hiddenToolsResult.isOk()).toBe(true);

    if (hiddenToolsResult.isErr()) {
      throw hiddenToolsResult.error;
    }

    const hiddenManifest = toolManifestToYAML(
      createToolManifest(hiddenToolsResult.value)
    );
    expect(hiddenManifest).not.toContain("name: dsbx");

    const visibleToolsResult = getToolsForProvider(auth, "openai", {
      includeDsbxTools: true,
    });
    expect(visibleToolsResult.isOk()).toBe(true);

    if (visibleToolsResult.isErr()) {
      throw visibleToolsResult.error;
    }

    const visibleManifest = toolManifestToYAML(
      createToolManifest(visibleToolsResult.value)
    );
    expect(visibleManifest).toContain("name: dsbx");
  });
});
