import { copyCoreTableFiles } from "@app/temporal/relocation/lib/file_storage/copy_core_tables";
import { describe, expect, it, vi } from "vitest";

const sourcePrefix = "project-old/source/";
const destinationPrefix = "project-new/destination/";
const metadata = { generation: "123", size: "42", crc32c: "checksum" };
const files = [{ name: `${sourcePrefix}nested/table.csv`, metadata }];

function setup() {
  const destination = new Map<string, typeof metadata>();
  const copyFile = vi.fn(async (_source: string, target: string) => {
    destination.set(target, metadata);
  });
  const getDestinationMetadata = vi.fn(async (name: string) =>
    destination.get(name) ?? null
  );
  return {
    destination,
    args: {
      files,
      sourcePrefix,
      destinationPrefix,
      copyFile,
      getDestinationMetadata,
      checkCanContinue: vi.fn(),
    },
  };
}

describe("direct core table copies", () => {
  it("preserves suffixes, pins source generations, and verifies the destination", async () => {
    const { args } = setup();
    await expect(copyCoreTableFiles(args)).resolves.toEqual({
      copied: 1,
      alreadyCopied: 0,
    });
    expect(args.copyFile).toHaveBeenCalledExactlyOnceWith(
      files[0].name,
      `${destinationPrefix}nested/table.csv`,
      "123"
    );
    expect(args.getDestinationMetadata).toHaveBeenCalledTimes(2);
  });

  it("skips verified objects on activity retries", async () => {
    const { args } = setup();
    await copyCoreTableFiles(args);
    args.copyFile.mockClear();
    await expect(copyCoreTableFiles(args)).resolves.toEqual({
      copied: 0,
      alreadyCopied: 1,
    });
    expect(args.copyFile).not.toHaveBeenCalled();
  });

  it("copies over a destination whose contents differ", async () => {
    const { args, destination } = setup();
    destination.set(`${destinationPrefix}nested/table.csv`, {
      ...metadata,
      crc32c: "different",
    });
    await expect(copyCoreTableFiles(args)).resolves.toEqual({
      copied: 1,
      alreadyCopied: 0,
    });
  });

  it("requires both size and checksum to match", async () => {
    const { args, destination } = setup();
    destination.set(`${destinationPrefix}nested/table.csv`, {
      ...metadata,
      size: "999",
    });
    await copyCoreTableFiles(args);
    expect(args.copyFile).toHaveBeenCalledTimes(1);
  });

  it("fails if verification after copying does not match", async () => {
    const { args } = setup();
    args.copyFile.mockImplementation(async () => {});
    await expect(copyCoreTableFiles(args)).rejects.toThrow(
      "verification failed"
    );
  });

  it.each(["generation", "size", "crc32c"] as const)(
    "fails closed without source %s",
    async (field) => {
      const { args } = setup();
      const incomplete: Partial<typeof metadata> = { ...metadata };
      delete incomplete[field];
      await expect(
        copyCoreTableFiles({
          ...args,
          files: [{ name: files[0].name, metadata: incomplete }],
        })
      ).rejects.toThrow("Missing source verification metadata");
      expect(args.copyFile).not.toHaveBeenCalled();
    }
  );

  it("does not treat destination permission failures as a missing object", async () => {
    const { args } = setup();
    const error = new Error("Permission denied");
    args.getDestinationMetadata.mockRejectedValueOnce(error);
    await expect(copyCoreTableFiles(args)).rejects.toBe(error);
    expect(args.copyFile).not.toHaveBeenCalled();
  });

  it("rejects unexpected source paths", async () => {
    const { args } = setup();
    await expect(
      copyCoreTableFiles({
        ...args,
        files: [{ name: "another-prefix/table.csv", metadata }],
      })
    ).rejects.toThrow("outside relocation prefix");
  });

  it("bounds active copies to five across multiple batches", async () => {
    const { args, destination } = setup();
    let active = 0;
    let peak = 0;
    args.copyFile.mockImplementation(async (_source, target) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 0));
      destination.set(target, metadata);
      active--;
    });
    const manyFiles = Array.from({ length: 13 }, (_, index) => ({
      name: `${sourcePrefix}${index}.csv`,
      metadata,
    }));
    await expect(
      copyCoreTableFiles({ ...args, files: manyFiles })
    ).resolves.toEqual({ copied: 13, alreadyCopied: 0 });
    expect(peak).toBe(5);
    expect(active).toBe(0);
  });

  it("drains in-flight siblings and does not launch another batch after failure", async () => {
    const { args, destination } = setup();
    let finished = 0;
    args.copyFile.mockImplementation(async (source, target) => {
      if (source.endsWith("0.csv")) {
        throw new Error("Copy failed");
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
      destination.set(target, metadata);
      finished++;
    });
    await expect(
      copyCoreTableFiles({
        ...args,
        files: Array.from({ length: 8 }, (_, index) => ({
          name: `${sourcePrefix}${index}.csv`,
          metadata,
        })),
      })
    ).rejects.toThrow("Copy failed");
    expect(args.copyFile).toHaveBeenCalledTimes(5);
    expect(finished).toBe(4);
  });

  it("stops before starting work on cancellation or an exhausted activity budget", async () => {
    const { args } = setup();
    args.checkCanContinue.mockImplementation(() => {
      throw new Error("Stop");
    });
    await expect(copyCoreTableFiles(args)).rejects.toThrow("Stop");
    expect(args.copyFile).not.toHaveBeenCalled();
  });
});
