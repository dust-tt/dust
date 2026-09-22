import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import { DocumentRootDemo } from "./themed-demo/DocumentRootDemo";

const meta = {
  title: "Documents/Frame DocumentRoot",
  component: DocumentRootDemo,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
} satisfies Meta<typeof DocumentRootDemo>;
export default meta;
type Story = StoryObj<typeof meta>;

/** @summary One file, three themes, a model-authored chart and persistent edits. */
export const ThemedDocument: Story = {
  play: async ({ canvas, canvasElement }) => {
    const editor = await canvas.findByRole("textbox", {
      name: "Document content",
    });
    await waitFor(() =>
      expect(editor).toHaveAttribute("contenteditable", "true")
    );
    await userEvent.click(canvas.getByRole("button", { name: "Select Q1" }));
    await expect(canvas.getByText("Q1: $42k")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Technical" }));
    await expect(canvas.getByText("Q1: $42k")).toBeVisible();
    await expect(
      canvas.getByRole("textbox", { name: "Document content" })
    ).toBe(editor);
    await waitFor(() => expect(getComputedStyle(editor).fontSize).toBe("16px"));
    const heading = editor.querySelector("h1");
    if (!heading) {
      throw new Error("Expected the document title");
    }
    await expect(getComputedStyle(heading).fontFamily).toContain("Geist Mono");

    await userEvent.click(editor);
    await userEvent.keyboard(" User edits stay in the file.");
    await waitFor(() => expect(canvas.getByText("Saved")).toBeVisible(), {
      timeout: 6000,
    });
    await userEvent.click(
      canvas.getByRole("button", { name: "Reopen document" })
    );
    await waitFor(() =>
      expect(
        canvas.getByRole("textbox", { name: "Document content" })
      ).toHaveTextContent("User edits stay in the file.")
    );
    await expect(
      canvasElement.querySelectorAll('[contenteditable="true"][role="textbox"]')
    ).toHaveLength(1);
  },
};

/** @summary Public cache reads retain themed visuals  without editing controls. */
export const SharedReadOnly: Story = {
  args: { readOnly: true },
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByRole("heading", { name: "A clearer path to launch" });
    await expect(
      canvasElement.querySelector('[contenteditable="true"]')
    ).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Business" }));
    await userEvent.click(canvas.getByRole("button", { name: "Select Q4" }));
    await expect(canvas.getByText("Q4: $91k")).toBeVisible();
  },
};

/** @summary Invalid presentation tokens fall back without preventing document access. */
export const InvalidTheme: Story = {
  args: { invalidTheme: true },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "theme is invalid"
    );
    await expect(
      await canvas.findByRole("textbox", { name: "Document content" })
    ).toHaveAttribute("contenteditable", "true");
  },
};

/** @summary Missing model-authored visuals leave a readable document and preserve their references. */
export const MissingVisual: Story = {
  args: { missingVisual: true },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("This visual is unavailable in this view.")
    ).toBeVisible();
    await expect(
      canvas.getByRole("textbox", { name: "Document content" })
    ).toBeVisible();
  },
};

/** @summary A failed conditional save keeps the draft visible. */
export const SaveConflict: Story = {
  args: { conflict: true },
  play: async ({ canvas }) => {
    const editor = await canvas.findByRole("textbox", {
      name: "Document content",
    });
    await userEvent.click(editor);
    await userEvent.keyboard(" Keep my draft.");
    await canvas.findByText("Not saved", {}, { timeout: 6000 });
    await expect(editor).toHaveTextContent("Keep my draft.");
    await expect(canvas.getByText(/changed elsewhere/)).toBeVisible();
  },
};
