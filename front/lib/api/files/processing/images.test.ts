import { processImage } from "@app/lib/api/files/processing/images";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { assert, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/config", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@app/lib/api/config")>();
  return {
    ...mod,
    default: {
      ...mod.default,
      getImgproxyUrl: () => "http://imgproxy.test",
      getImgproxyKey: () => "abcd",
      getImgproxySalt: () => "1234",
    },
  };
});

describe("SVG rasterization", () => {
  it.each([
    { useCase: "conversation", useCaseMetadata: null, maxSizePixels: 1538 },
    { useCase: "avatar", useCaseMetadata: null, maxSizePixels: 256 },
    {
      useCase: "workspace_branding",
      useCaseMetadata: { asset: "logo" },
      maxSizePixels: 512,
    },
    {
      useCase: "workspace_branding",
      useCaseMetadata: { asset: "favicon" },
      maxSizePixels: 256,
    },
  ] as const)(
    "converts $useCase SVG to PNG via imgproxy with a $maxSizePixels pixel cap",
    async ({ useCase, useCaseMetadata, maxSizePixels }) => {
      const { authenticator: auth } = await createResourceTest({
        role: "admin",
      });
      const file = await FileFactory.create(auth, null, {
        contentType: "image/svg+xml",
        fileName: "upload.svg",
        fileSize: 100,
        status: "created",
        useCase,
        useCaseMetadata,
      });
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("converted PNG bytes", {
          headers: { "Content-Type": "image/png" },
        })
      );

      const result = await processImage(auth, file);

      assert(result.isOk());
      const source = Buffer.from("https://signed-url.test").toString(
        "base64url"
      );
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringMatching(
          new RegExp(
            `^http://imgproxy\\.test/[^/]+/rs:fit:${maxSizePixels}:${maxSizePixels}:0/${source}\\.png$`
          )
        )
      );
      expect(fileStorageMock.signedUrlCalls[0].filePath).toBe(
        file.getCloudStoragePath(auth, "original")
      );
      // The application never reads or decodes the uploaded bytes itself,
      // including when a binary image is disguised with an SVG content type.
      expect(fileStorageMock.readStreamCalls).toHaveLength(0);
      expect(fileStorageMock.writeStreamCalls).toEqual([
        {
          filePath: file.getCloudStoragePath(auth, "processed"),
          contentType: "image/png",
        },
      ]);
    }
  );

  it("returns an error without writing output when imgproxy rejects the image", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    const file = await FileFactory.create(auth, null, {
      contentType: "image/svg+xml",
      fileName: "invalid.svg",
      fileSize: 100,
      status: "created",
      useCase: "conversation",
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 422, statusText: "Unprocessable Entity" })
    );

    const result = await processImage(auth, file);

    assert(result.isErr());
    expect(result.error.message).toContain("Failed rasterizing SVG:");
    expect(fileStorageMock.readStreamCalls).toHaveLength(0);
    expect(fileStorageMock.writeStreamCalls).toHaveLength(0);
  });
});
