import { SkillBuilderFilesSection } from "@app/components/skill_builder/SkillBuilderFilesSection";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormProvider, useForm } from "react-hook-form";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { handleFilesUpload, sendNotification } = vi.hoisted(() => ({
  handleFilesUpload: vi.fn(),
  sendNotification: vi.fn(),
}));

vi.mock("@app/components/skill_builder/SkillBuilderContext", () => ({
  useSkillBuilderContext: () => ({ owner: { sId: "workspace" } }),
}));
vi.mock("@app/components/skill_builder/SkillBuilderVersionContext", () => ({
  useSkillVersionComparisonContext: () => ({ isDiffMode: false }),
}));
vi.mock("@app/lib/auth/AuthContext", () => ({
  useFeatureFlags: () => ({ featureFlags: [] }),
}));
vi.mock("@app/hooks/useNotification", () => ({
  useSendNotification: () => sendNotification,
}));
vi.mock("@app/hooks/useFileUploaderService", () => ({
  useFileUploaderService: () => ({
    handleFilesUpload,
    isProcessingFiles: false,
  }),
}));

function renderSection(
  fileAttachments: SkillBuilderFormData["fileAttachments"] = []
) {
  function Wrapper() {
    const form = useForm<SkillBuilderFormData>({
      defaultValues: { fileAttachments },
    });
    return (
      <FormProvider {...form}>
        <SkillBuilderFilesSection />
      </FormProvider>
    );
  }
  const { container } = render(<Wrapper />);
  const input = container.querySelector("input");
  if (!input) {
    throw new Error("File input missing");
  }
  return input;
}

describe("SkillBuilderFilesSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
      }
    );
    handleFilesUpload.mockImplementation(async (files: File[]) =>
      files.map((file) => ({ fileId: file.name, filename: file.name }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("switches between folder and individual file selection", async () => {
    const user = userEvent.setup();
    const input = renderSection();
    const click = vi.spyOn(input, "click").mockImplementation(() => {});

    await user.click(screen.getByRole("button", { name: "Upload files" }));
    await user.click(screen.getByRole("menuitem", { name: "Upload folder" }));
    expect(input.webkitdirectory).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Upload files" }));
    await user.click(screen.getByRole("menuitem", { name: "Upload files" }));
    expect(input.webkitdirectory).toBe(false);
    expect(click).toHaveBeenCalledTimes(2);
  });

  it("flattens folder paths and skips existing and selected duplicate names", async () => {
    const input = renderSection([
      { fileId: "existing", fileName: "templates_old_report.txt" },
    ]);
    const files = [
      "templates/old/report.txt",
      "templates/new/report.txt",
      "templates/report.txt",
      "templates/new_report.txt",
    ].map((relativePath) => {
      const file = new File(
        [relativePath],
        relativePath.slice(relativePath.lastIndexOf("/") + 1),
        { type: "text/plain", lastModified: 1234 }
      );
      Object.defineProperty(file, "webkitRelativePath", {
        value: relativePath,
      });
      return file;
    });

    fireEvent.change(input, { target: { files } });

    await screen.findByText("templates_new_report.txt");
    expect(screen.getByText("templates_report.txt")).toBeInTheDocument();
    expect(handleFilesUpload).toHaveBeenCalledWith([
      expect.objectContaining({
        name: "templates_new_report.txt",
        type: "text/plain",
        lastModified: 1234,
      }),
      expect.objectContaining({ name: "templates_report.txt" }),
    ]);
    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        description:
          "Duplicate names: templates_old_report.txt, templates_new_report.txt",
      })
    );
    expect(input.value).toBe("");
  });

  it("keeps individual file uploads unchanged", async () => {
    const input = renderSection();
    const file = new File(["content"], "report.txt", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(handleFilesUpload).toHaveBeenCalledWith([file]);
      expect(screen.getByText("report.txt")).toBeInTheDocument();
    });
  });
});
