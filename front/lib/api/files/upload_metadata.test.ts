import { buildEffectiveUseCaseMetadata } from "@app/lib/api/files/upload_metadata";
import { describe, expect, it } from "vitest";

const XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" as const;
const PPTX =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation" as const;

describe("buildEffectiveUseCaseMetadata", () => {
  it("stamps skipFileProcessing for skill delimited/data files", () => {
    // XLSX is delimited; PPTX is data — both are read raw in the sandbox for skills.
    expect(
      buildEffectiveUseCaseMetadata({
        contentType: XLSX,
        fileName: "data.xlsx",
        providedMetadata: { skillId: "skl_1" },
        useCase: "skill_attachment",
      })
    ).toMatchObject({
      skillId: "skl_1",
      skipFileProcessing: true,
      skipDataSourceIndexing: true,
    });

    expect(
      buildEffectiveUseCaseMetadata({
        contentType: PPTX,
        fileName: "deck.pptx",
        providedMetadata: { skillId: "skl_1" },
        useCase: "skill_attachment",
      })
    ).toMatchObject({ skipFileProcessing: true });
  });

  it("does not stamp skill images (not a raw category)", () => {
    const metadata = buildEffectiveUseCaseMetadata({
      contentType: "image/png",
      fileName: "logo.png",
      providedMetadata: { skillId: "skl_1" },
      useCase: "skill_attachment",
    });

    expect(metadata?.skipFileProcessing).toBeUndefined();
  });

  it("stamps sandbox delimited conversation files (regression)", () => {
    expect(
      buildEffectiveUseCaseMetadata({
        contentType: "text/csv",
        fileName: "data.csv",
        providedMetadata: { conversationId: "conv_1" },
        useCase: "conversation",
      })
    ).toMatchObject({ skipFileProcessing: true });
  });

  it("does not stamp conversation documents (data stays normal)", () => {
    const metadata = buildEffectiveUseCaseMetadata({
      contentType: "application/pdf",
      fileName: "report.pdf",
      providedMetadata: { conversationId: "conv_1" },
      useCase: "conversation",
    });

    expect(metadata?.skipFileProcessing).toBeUndefined();
  });
});
