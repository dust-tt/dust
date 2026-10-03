import type { Meta, StoryObj } from "@storybook/react-vite";
import React from "react";
import { expect, fireEvent, fn, userEvent, within } from "storybook/test";

import DustFileSystem, {
  WorkspaceView,
} from "../../playground/src/stories/Dust File System";
import {
  buildWorkspace,
  canDropInto,
  derivePodFiles,
  type DataSource,
  indexFilesById,
  indexFilesByParentId,
  isPodFile,
  mockUsers,
  type WorkspaceModel,
} from "../../playground/src/data";

const user = mockUsers[0];
const pod = {
  id: "space-1",
  name: "Roadmap pod",
  description: "Plan the roadmap.",
  isPublic: true,
};
const baseFile = {
  source: "company",
  createdBy: user.id,
  createdAt: new Date("2026-10-01"),
  updatedAt: new Date("2026-10-01"),
} satisfies Partial<DataSource>;
const files: DataSource[] = [
  {
    ...baseFile,
    id: "product",
    kind: "folder",
    fileName: "Product",
    parentId: null,
  },
  {
    ...baseFile,
    id: "archive",
    kind: "folder",
    fileName: "Archive",
    parentId: null,
  },
  {
    ...baseFile,
    id: "pod",
    kind: "file",
    fileType: "pod",
    fileName: pod.name,
    parentId: "product",
    refId: pod.id,
  },
  {
    ...baseFile,
    id: "brief",
    kind: "file",
    fileType: "md",
    fileName: "Launch brief.md",
    parentId: "product",
  },
  {
    ...baseFile,
    id: "archive-file",
    kind: "file",
    fileType: "md",
    fileName: "Previous launch.md",
    parentId: "archive",
  },
  {
    ...baseFile,
    id: "skill",
    kind: "file",
    fileType: "skill",
    fileName: "Planning.skill.md",
    parentId: "product",
  },
];
const byParentId = indexFilesByParentId(files);
const model: WorkspaceModel = {
  ...buildWorkspace("clean", user.id),
  pods: [pod],
  conversations: [
    {
      id: "pod-conversation",
      title: "Plan the launch",
      spaceId: pod.id,
      createdAt: baseFile.createdAt,
      updatedAt: baseFile.updatedAt,
      userParticipants: [user.id],
      agentParticipants: [],
    },
    {
      id: "free-conversation",
      title: "A separate question",
      createdAt: baseFile.createdAt,
      updatedAt: baseFile.updatedAt,
      userParticipants: [user.id],
      agentParticipants: [],
    },
  ],
  files,
  filesByParentId: byParentId,
  podFilesBySpaceId: derivePodFiles(byParentId, files.filter(isPodFile)),
};

const meta = {
  title: "Playground/File System",
  component: DustFileSystem,
  tags: ["!manifest"],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof DustFileSystem>;

export default meta;
type Story = StoryObj<typeof meta>;
type WorkspaceStory = StoryObj<typeof WorkspaceView>;

const workspaceFixture = {
  args: { model, user, onProfileChange: fn() },
  render: (args) => <WorkspaceView {...args} />,
} satisfies WorkspaceStory;

const table = (canvas: ReturnType<typeof within>) =>
  within(canvas.getByRole("table"));

/** @summary The full prototype with the original Clean and Mature workspace profiles. */
export const Prototype: Story = {};

/** @summary Switching profiles restores the original data and clears changes from the previous session. */
export const ProfileSwitching: Story = {
  play: async ({ canvas, canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const selectProfile = async (name: "Clean" | "Mature") => {
      await userEvent.click(
        canvas.getByRole("button", { name: /Open user menu/ })
      );
      await userEvent.click(page.getByRole("menuitem", { name: "Dev" }));
      await userEvent.click(await page.findByRole("menuitemradio", { name }));
      await userEvent.click(canvas.getByText("Files", { exact: true }));
      await canvas.findByRole("table");
    };

    await selectProfile("Mature");
    await expect(
      table(canvas).getAllByText("Engineering", { exact: true }).length
    ).toBeGreaterThan(0);
    const matureRows = table(canvas).getAllByRole("row").length;
    await expect(matureRows).toBeGreaterThan(4);

    await selectProfile("Clean");
    await expect(table(canvas).getAllByRole("row")).toHaveLength(4);
    await expect(table(canvas).getByText("Welcome to Dust.md")).toBeVisible();
    await expect(
      table(canvas).getByText("Workspace guidelines.md")
    ).toBeVisible();
    await expect(table(canvas).getByText("Connect your data.md")).toBeVisible();

    await userEvent.click(canvas.getByRole("button", { name: "Create" }));
    await userEvent.click(page.getByRole("menuitem", { name: "Pod" }));
    const dialog = within(page.getByRole("dialog"));
    await userEvent.type(
      dialog.getByPlaceholderText("Enter the pod name"),
      "Temporary pod"
    );
    await userEvent.click(dialog.getByRole("button", { name: "Create" }));
    await userEvent.click(await canvas.findByRole("tab", { name: "Files" }));
    await expect(table(canvas).getByText("Temporary pod")).toBeVisible();

    await selectProfile("Mature");
    await expect(table(canvas).getAllByRole("row")).toHaveLength(matureRows);
    await expect(canvas.queryByText("Temporary pod")).not.toBeInTheDocument();

    await selectProfile("Clean");
    await expect(table(canvas).getAllByRole("row")).toHaveLength(4);
    await expect(canvas.queryByText("Temporary pod")).not.toBeInTheDocument();
  },
};

/** @summary Pods open their conversations and share their containing folder's files. */
export const PodFolderNavigation: WorkspaceStory = {
  ...workspaceFixture,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByText("Files", { exact: true }));
    await userEvent.click(table(canvas).getByText("Product", { exact: true }));
    await userEvent.click(table(canvas).getByText(pod.name));
    await expect(
      await canvas.findByRole("tab", { name: "Conversations" })
    ).toHaveAttribute("data-state", "active");
    await userEvent.click(await canvas.findByRole("tab", { name: "Files" }));
    await expect(table(canvas).getByText("Launch brief.md")).toBeVisible();
    await expect(table(canvas).getByText("Planning.skill.md")).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Open in Files" })
    );
    await expect(table(canvas).getByText(pod.name)).toBeVisible();

    // Moving the Pod changes its folder view without moving its former siblings.
    const carried = new DataTransfer();
    await fireEvent.dragStart(
      table(canvas).getByRole("row", { name: /Roadmap pod/ }),
      {
        dataTransfer: carried,
      }
    );
    await fireEvent.dragOver(canvas.getByText("Archive", { exact: true }), {
      dataTransfer: carried,
    });
    await fireEvent.drop(canvas.getByText("Archive", { exact: true }), {
      dataTransfer: carried,
    });
    await expect(table(canvas).queryByText(pod.name)).not.toBeInTheDocument();
    await expect(table(canvas).getByText("Launch brief.md")).toBeVisible();

    // A skill can move to the same ordinary folder.
    const skillDrag = new DataTransfer();
    await fireEvent.dragStart(
      table(canvas).getByRole("row", { name: /Planning.skill.md/ }),
      { dataTransfer: skillDrag }
    );
    await fireEvent.dragOver(canvas.getByText("Archive", { exact: true }), {
      dataTransfer: skillDrag,
    });
    await fireEvent.drop(canvas.getByText("Archive", { exact: true }), {
      dataTransfer: skillDrag,
    });
    await expect(
      table(canvas).queryByText("Planning.skill.md")
    ).not.toBeInTheDocument();
    await userEvent.click(canvas.getByText("Archive", { exact: true }));
    await userEvent.click(table(canvas).getByText(pod.name));
    await userEvent.click(await canvas.findByRole("tab", { name: "Files" }));
    await expect(table(canvas).getByText("Previous launch.md")).toBeVisible();
    await expect(table(canvas).getByText("Planning.skill.md")).toBeVisible();
    await expect(
      table(canvas).queryByText("Launch brief.md")
    ).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Open in Files" })
    );
    await expect(table(canvas).getByText("Previous launch.md")).toBeVisible();
  },
};

/** @summary Creating a Pod at the workspace root adds a file beside existing documents. */
export const CreateRootPod: WorkspaceStory = {
  ...workspaceFixture,
  args: { ...workspaceFixture.args, model: buildWorkspace("clean", user.id) },
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(canvas.getByText("Files", { exact: true }));
    await userEvent.click(canvas.getByRole("button", { name: "Create" }));
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(page.getByRole("menuitem", { name: "Pod" }));
    const dialog = within(page.getByRole("dialog"));
    await userEvent.type(
      dialog.getByPlaceholderText("Enter the pod name"),
      "New pod"
    );
    await userEvent.click(dialog.getByRole("button", { name: "Create" }));
    await userEvent.click(await canvas.findByRole("tab", { name: "Files" }));
    await expect(table(canvas).getByText("New pod")).toBeVisible();
    await expect(table(canvas).getByText("Welcome to Dust.md")).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Open in Files" })
    );
    await userEvent.click(table(canvas).getByText("New pod"));
    await expect(
      await canvas.findByRole("tab", { name: "Conversations" })
    ).toHaveAttribute("data-state", "active");
  },
};

/** @summary The mature workspace excludes conversations and agents from its file tree. */
export const WorkspaceModelRules: WorkspaceStory = {
  ...workspaceFixture,
  play: async () => {
    const mature = buildWorkspace("mature", user.id);
    const byId = indexFilesById(mature.files);
    await expect(mature.agents.length).toBeGreaterThan(0);
    await expect(
      mature.conversations.some((conversation) => !conversation.spaceId)
    ).toBe(true);
    await expect(
      mature.conversations.some((conversation) => conversation.spaceId)
    ).toBe(true);
    await expect(mature.conversationFilesByConversationId.size).toBeGreaterThan(
      0
    );
    await expect(
      mature.files.some(
        (file) =>
          file.fileType === "agent" ||
          file.folderType === "conversation" ||
          file.folderType === "system"
      )
    ).toBe(false);
    await expect(mature.files.filter(isPodFile)).toHaveLength(
      mature.pods.length
    );
    await expect(
      mature.files.every(
        (file) =>
          file.parentId === null || byId.get(file.parentId)?.kind === "folder"
      )
    ).toBe(true);
    const skill = files.find((file) => file.fileType === "skill");
    if (!skill) {
      throw new Error("The file fixture must include a skill.");
    }
    await expect(canDropInto(indexFilesById(files), skill.id, null)).toBe(true);
    await expect(canDropInto(indexFilesById(files), skill.id, "pod")).toBe(
      false
    );
  },
};
