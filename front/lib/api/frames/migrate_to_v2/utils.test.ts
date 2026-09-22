import { planFrameV2Migration } from "@app/lib/api/frames/migrate_to_v2/utils";
import {
  FRAME_MANIFEST_FILE,
  MAX_FRAME_NAME_LENGTH,
  parseFrameManifest,
  validateFrameV2Name,
} from "@app/types/api/frame_manifest";
import assert from "assert";
import { describe, expect, it } from "vitest";

const SCOPE = "conversation-conv_x";

function plan({
  fileName = "Sales.tsx",
  sId = "fil_abc",
  entryScopedPath = `${SCOPE}/Sales.tsx`,
  sourceScopedPaths = [`${SCOPE}/Sales.tsx`],
  takenFolderNames = new Set<string>(),
}: {
  fileName?: string;
  sId?: string;
  entryScopedPath?: string;
  sourceScopedPaths?: string[];
  takenFolderNames?: ReadonlySet<string>;
} = {}) {
  return planFrameV2Migration({
    frame: { fileName, sId },
    entryScopedPath,
    sourceScopedPaths,
    takenFolderNames,
  });
}

describe("planFrameV2Migration", () => {
  it("gives a flat Frame its own folder and relocates its entry into it", () => {
    const result = plan();
    assert(result.isOk(), "flat entry must be planable");

    expect(result.value.folderScopedPath).toBe(`${SCOPE}/Sales`);
    expect(result.value.manifestScopedPath).toBe(
      `${SCOPE}/Sales/${FRAME_MANIFEST_FILE}`
    );
    expect(result.value.uiEntryPoint).toBe("index.tsx");
    expect(result.value.relocations).toEqual([
      { from: `${SCOPE}/Sales.tsx`, to: `${SCOPE}/Sales/index.tsx` },
    ]);
  });

  it("relocates the whole import graph, preserving each path relative to the old root", () => {
    const result = plan({
      sourceScopedPaths: [
        `${SCOPE}/Sales.tsx`,
        `${SCOPE}/helpers.tsx`,
        `${SCOPE}/lib/format.ts`,
      ],
    });
    assert(result.isOk(), "entry with imports must be planable");

    expect(result.value.relocations).toEqual([
      { from: `${SCOPE}/Sales.tsx`, to: `${SCOPE}/Sales/index.tsx` },
      { from: `${SCOPE}/helpers.tsx`, to: `${SCOPE}/Sales/helpers.tsx` },
      { from: `${SCOPE}/lib/format.ts`, to: `${SCOPE}/Sales/lib/format.ts` },
    ]);
  });

  it("relocates the entry once when the sources already list it", () => {
    const result = plan({
      sourceScopedPaths: [`${SCOPE}/helpers.tsx`, `${SCOPE}/Sales.tsx`],
    });
    assert(result.isOk(), "entry listed among sources must be planable");

    expect(result.value.relocations).toEqual([
      { from: `${SCOPE}/Sales.tsx`, to: `${SCOPE}/Sales/index.tsx` },
      { from: `${SCOPE}/helpers.tsx`, to: `${SCOPE}/Sales/helpers.tsx` },
    ]);
  });

  it("leaves a Frame that already lives in a folder where it is", () => {
    const result = plan({
      entryScopedPath: `${SCOPE}/dashboards/sales/index.tsx`,
      sourceScopedPaths: [
        `${SCOPE}/dashboards/sales/index.tsx`,
        `${SCOPE}/dashboards/sales/Chart.tsx`,
      ],
    });
    assert(result.isOk(), "foldered entry must be planable");

    expect(result.value.folderScopedPath).toBe(`${SCOPE}/dashboards/sales`);
    expect(result.value.manifestScopedPath).toBe(
      `${SCOPE}/dashboards/sales/${FRAME_MANIFEST_FILE}`
    );
    expect(result.value.uiEntryPoint).toBe("index.tsx");
    expect(result.value.relocations).toEqual([]);
  });

  it("suffixes the folder name with the Frame sId when the name is taken", () => {
    const result = plan({ takenFolderNames: new Set(["Sales"]) });
    assert(result.isOk(), "colliding name must still be planable");

    expect(result.value.folderScopedPath).toBe(`${SCOPE}/Sales_fil_abc`);
    expect(result.value.relocations).toEqual([
      { from: `${SCOPE}/Sales.tsx`, to: `${SCOPE}/Sales_fil_abc/index.tsx` },
    ]);
  });

  it("falls back to the Frame sId when the file name yields no usable folder name", () => {
    const result = plan({
      fileName: ".tsx",
      entryScopedPath: `${SCOPE}/.tsx`,
      sourceScopedPaths: [`${SCOPE}/.tsx`],
    });
    assert(result.isOk(), "extension-only name must still be planable");

    expect(result.value.folderScopedPath).toBe(`${SCOPE}/fil_abc`);
  });

  it("reads a CamelCase file name as words", () => {
    const result = plan({
      fileName: "SalesDashboard.tsx",
      entryScopedPath: `${SCOPE}/SalesDashboard.tsx`,
      sourceScopedPaths: [`${SCOPE}/SalesDashboard.tsx`],
    });
    assert(result.isOk(), "CamelCase name must be planable");

    expect(result.value.folderScopedPath).toBe(`${SCOPE}/Sales Dashboard`);
    expect(result.value.relocations).toEqual([
      {
        from: `${SCOPE}/SalesDashboard.tsx`,
        to: `${SCOPE}/Sales Dashboard/index.tsx`,
      },
    ]);
  });

  it("keeps an acronym whole when splitting a CamelCase file name", () => {
    const result = plan({
      fileName: "KPIReportQ3.tsx",
      entryScopedPath: `${SCOPE}/KPIReportQ3.tsx`,
      sourceScopedPaths: [`${SCOPE}/KPIReportQ3.tsx`],
    });
    assert(result.isOk(), "acronym name must be planable");

    expect(result.value.folderScopedPath).toBe(`${SCOPE}/KPI Report Q3`);
  });

  it("leaves a file name that is already words alone", () => {
    const result = plan({
      fileName: "Sales report.tsx",
      entryScopedPath: `${SCOPE}/Sales report.tsx`,
      sourceScopedPaths: [`${SCOPE}/Sales report.tsx`],
    });
    assert(result.isOk(), "spaced name must be planable");

    expect(result.value.folderScopedPath).toBe(`${SCOPE}/Sales report`);
  });

  it("keeps an extensionless file name whole", () => {
    const result = plan({
      fileName: "Dashboard",
      entryScopedPath: `${SCOPE}/Dashboard`,
      sourceScopedPaths: [`${SCOPE}/Dashboard`],
    });
    assert(result.isOk(), "extensionless name must be planable");

    expect(result.value.folderScopedPath).toBe(`${SCOPE}/Dashboard`);
  });

  it("renames a relocated entry to index.tsx", () => {
    const result = plan({
      entryScopedPath: `${SCOPE}/Sales.tsx`,
      sourceScopedPaths: [`${SCOPE}/Sales.tsx`, `${SCOPE}/helpers.tsx`],
    });
    assert(result.isOk(), "entry must be planable");

    expect(result.value.uiEntryPoint).toBe("index.tsx");
    expect(result.value.manifest.uiEntryPoint).toBe("index.tsx");
    expect(result.value.relocations).toEqual([
      { from: `${SCOPE}/Sales.tsx`, to: `${SCOPE}/Sales/index.tsx` },
      { from: `${SCOPE}/helpers.tsx`, to: `${SCOPE}/Sales/helpers.tsx` },
    ]);
  });

  it("keeps the entry's own name when a sibling already claims index.tsx", () => {
    const result = plan({
      entryScopedPath: `${SCOPE}/Sales.tsx`,
      sourceScopedPaths: [`${SCOPE}/Sales.tsx`, `${SCOPE}/index.tsx`],
    });
    assert(result.isOk(), "entry with an index sibling must be planable");

    expect(result.value.uiEntryPoint).toBe("Sales.tsx");
    expect(result.value.relocations).toEqual([
      { from: `${SCOPE}/Sales.tsx`, to: `${SCOPE}/Sales/Sales.tsx` },
      { from: `${SCOPE}/index.tsx`, to: `${SCOPE}/Sales/index.tsx` },
    ]);
  });

  it("keeps the name of an entry that stays in its own folder", () => {
    const result = plan({
      entryScopedPath: `${SCOPE}/dashboards/sales/Report.tsx`,
      sourceScopedPaths: [`${SCOPE}/dashboards/sales/Report.tsx`],
    });
    assert(result.isOk(), "foldered entry must be planable");

    expect(result.value.uiEntryPoint).toBe("Report.tsx");
    expect(result.value.relocations).toEqual([]);
  });

  it("clamps the Frame name to the maximum Frame name length", () => {
    const longName = "a".repeat(MAX_FRAME_NAME_LENGTH + 50);
    const result = plan({
      fileName: `${longName}.tsx`,
      entryScopedPath: `${SCOPE}/${longName}.tsx`,
      sourceScopedPaths: [`${SCOPE}/${longName}.tsx`],
    });
    assert(result.isOk(), "long name must be planable");

    expect(result.value.folderScopedPath).toBe(
      `${SCOPE}/${"a".repeat(MAX_FRAME_NAME_LENGTH)}`
    );
  });

  it("keeps a disambiguated folder within the Frame name limit", () => {
    const longName = "a".repeat(MAX_FRAME_NAME_LENGTH);
    const result = plan({
      fileName: `${longName}.tsx`,
      entryScopedPath: `${SCOPE}/${longName}.tsx`,
      sourceScopedPaths: [`${SCOPE}/${longName}.tsx`],
      takenFolderNames: new Set([longName]),
    });
    assert(result.isOk(), "a colliding long name must still be planable");

    const folderName = result.value.folderScopedPath.slice(SCOPE.length + 1);
    expect(folderName.length).toBeLessThanOrEqual(MAX_FRAME_NAME_LENGTH);
    expect(validateFrameV2Name(folderName).isOk()).toBe(true);
    expect(folderName).toContain("fil_abc");
  });

  it("refuses a stray source even when the Frame keeps its folder", () => {
    const result = plan({
      entryScopedPath: `${SCOPE}/dashboards/sales/index.tsx`,
      sourceScopedPaths: [
        `${SCOPE}/dashboards/sales/index.tsx`,
        "conversation-other/helper.ts",
      ],
    });

    expect(result.isErr()).toBe(true);
  });

  it("produces a manifest the Frame manifest parser accepts", () => {
    const result = plan();
    assert(result.isOk(), "plan must succeed");

    const parsed = parseFrameManifest(
      Buffer.from(JSON.stringify(result.value.manifest), "utf-8")
    );
    assert(parsed.isOk(), "generated manifest must parse");
    expect(parsed.value.uiEntryPoint).toBe("index.tsx");
    expect(parsed.value.functions).toEqual([]);
    expect(parsed.value.databases).toEqual([]);
  });

  it("refuses an entry path that has no directory to anchor the Frame", () => {
    expect(plan({ entryScopedPath: "Sales.tsx" }).isErr()).toBe(true);
  });

  it("refuses a source that does not sit under the entry's root", () => {
    const result = plan({
      sourceScopedPaths: [
        `${SCOPE}/Sales.tsx`,
        "conversation-other/helpers.tsx",
      ],
    });
    expect(result.isErr()).toBe(true);
  });
});
