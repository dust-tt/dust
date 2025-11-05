import {
  Button,
  Input,
  TextArea,
} from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import { useState } from "react";

import PokeLayout from "@app/components/poke/PokeLayout";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";

export const getServerSideProps = withSuperUserAuthRequirements<object>(
  async () => {
    return {
      props: {},
    };
  }
);

function BroadcastForm() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    shortDescription: "",
    longDescription: "",
    mediaUrl: "",
    mediaType: "" as "" | "image" | "gif" | "video",
    publishToChangelog: true,
    shouldBroadcast: true,
    targetingType: "all" as "all" | "users" | "workspaces" | "plans",
    targetingData: {
      userIds: [] as string[],
      workspaceIds: [] as string[],
      planCodes: [] as string[],
    },
    startDate: new Date().toISOString().slice(0, 16),
    endDate: "",
    priority: 0,
    status: "draft" as "draft" | "published",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title || !formData.shortDescription || !formData.startDate) {
      alert("Please fill in all required fields");
      return;
    }

    setSaving(true);

    try {
      const targetingData =
        formData.targetingType === "all"
          ? null
          : formData.targetingType === "users"
          ? { userIds: formData.targetingData.userIds.filter(Boolean) }
          : formData.targetingType === "workspaces"
          ? { workspaceIds: formData.targetingData.workspaceIds.filter(Boolean) }
          : { planCodes: formData.targetingData.planCodes.filter(Boolean) };

      const response = await fetch("/api/poke/broadcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          mediaType: formData.mediaType || null,
          targetingData,
          endDate: formData.endDate || null,
        }),
      });

      if (response.ok) {
        router.push("/poke/broadcasts");
      } else {
        const error = await response.json();
        alert(`Failed to create broadcast: ${error.error?.message || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to save broadcast:", error);
      alert("Failed to save broadcast");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-6 text-2xl font-bold">Create New Broadcast</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="mb-2 block text-sm font-medium">
            Title <span className="text-red-500">*</span>
          </label>
          <Input
            value={formData.title}
            onChange={(value) =>
              setFormData({ ...formData, title: value })
            }
            placeholder="e.g., Introducing New Feature"
            className="w-full"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">
            Short Description <span className="text-red-500">*</span>
          </label>
          <TextArea
            value={formData.shortDescription}
            onChange={(value) =>
              setFormData({ ...formData, shortDescription: value })
            }
            placeholder="Brief description (1-2 lines) shown in the banner"
            rows={2}
            className="w-full"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">
            Long Description (Markdown)
          </label>
          <TextArea
            value={formData.longDescription}
            onChange={(value) =>
              setFormData({ ...formData, longDescription: value })
            }
            placeholder="Detailed description for the changelog page (supports Markdown)"
            rows={8}
            className="w-full font-mono text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-2 block text-sm font-medium">Media URL</label>
            <Input
              value={formData.mediaUrl}
              onChange={(value) =>
                setFormData({ ...formData, mediaUrl: value })
              }
              placeholder="https://example.com/image.png"
              className="w-full"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">Media Type</label>
            <select
              value={formData.mediaType}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  mediaType: e.target.value as typeof formData.mediaType,
                })
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            >
              <option value="">None</option>
              <option value="image">Image</option>
              <option value="gif">GIF</option>
              <option value="video">Video</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-2 block text-sm font-medium">
              Start Date <span className="text-red-500">*</span>
            </label>
            <input
              type="datetime-local"
              value={formData.startDate}
              onChange={(e) =>
                setFormData({ ...formData, startDate: e.target.value })
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2"
              required
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">
              End Date (Optional)
            </label>
            <input
              type="datetime-local"
              value={formData.endDate}
              onChange={(e) =>
                setFormData({ ...formData, endDate: e.target.value })
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">Targeting</label>
          <select
            value={formData.targetingType}
            onChange={(e) =>
              setFormData({
                ...formData,
                targetingType: e.target.value as typeof formData.targetingType,
              })
            }
            className="w-full rounded-md border border-gray-300 px-3 py-2"
          >
            <option value="all">All Users</option>
            <option value="users">Specific Users</option>
            <option value="workspaces">Specific Workspaces</option>
            <option value="plans">Specific Plans</option>
          </select>
        </div>

        {formData.targetingType === "users" && (
          <div>
            <label className="mb-2 block text-sm font-medium">
              User IDs (comma-separated)
            </label>
            <TextArea
              value={formData.targetingData.userIds.join(", ")}
              onChange={(value) =>
                setFormData({
                  ...formData,
                  targetingData: {
                    ...formData.targetingData,
                    userIds: value.split(",").map((id) => id.trim()),
                  },
                })
              }
              placeholder="user_id_1, user_id_2, ..."
              rows={3}
              className="w-full"
            />
          </div>
        )}

        {formData.targetingType === "workspaces" && (
          <div>
            <label className="mb-2 block text-sm font-medium">
              Workspace IDs (comma-separated)
            </label>
            <TextArea
              value={formData.targetingData.workspaceIds.join(", ")}
              onChange={(value) =>
                setFormData({
                  ...formData,
                  targetingData: {
                    ...formData.targetingData,
                    workspaceIds: value.split(",").map((id) => id.trim()),
                  },
                })
              }
              placeholder="workspace_id_1, workspace_id_2, ..."
              rows={3}
              className="w-full"
            />
          </div>
        )}

        {formData.targetingType === "plans" && (
          <div>
            <label className="mb-2 block text-sm font-medium">
              Plan Codes (comma-separated)
            </label>
            <TextArea
              value={formData.targetingData.planCodes.join(", ")}
              onChange={(value) =>
                setFormData({
                  ...formData,
                  targetingData: {
                    ...formData.targetingData,
                    planCodes: value.split(",").map((code) => code.trim()),
                  },
                })
              }
              placeholder="PRO_PLAN_MONTHLY, ENTERPRISE_PLAN_YEARLY, ..."
              rows={3}
              className="w-full"
            />
          </div>
        )}

        <div>
          <label className="mb-2 block text-sm font-medium">Priority</label>
          <Input
            value={formData.priority.toString()}
            onChange={(value) =>
              setFormData({ ...formData, priority: parseInt(value, 10) || 0 })
            }
            placeholder="0"
            type="number"
            className="w-32"
          />
          <p className="mt-1 text-xs text-gray-500">
            Higher priority broadcasts are shown first
          </p>
        </div>

        <div className="space-y-3">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={formData.shouldBroadcast}
              onChange={(e) =>
                setFormData({ ...formData, shouldBroadcast: e.target.checked })
              }
              className="mr-2"
            />
            <span className="text-sm font-medium">
              Show as in-app banner
            </span>
          </label>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={formData.publishToChangelog}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  publishToChangelog: e.target.checked,
                })
              }
              className="mr-2"
            />
            <span className="text-sm font-medium">
              Publish to changelog
            </span>
          </label>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">Status</label>
          <select
            value={formData.status}
            onChange={(e) =>
              setFormData({
                ...formData,
                status: e.target.value as typeof formData.status,
              })
            }
            className="w-full rounded-md border border-gray-300 px-3 py-2"
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
        </div>

        <div className="flex justify-end gap-3">
          <Button
            variant="secondary"
            size="md"
            label="Cancel"
            onClick={() => router.push("/poke/broadcasts")}
            disabled={saving}
          />
          <Button
            variant="primary"
            size="md"
            label={saving ? "Saving..." : "Create Broadcast"}
            type="submit"
            disabled={saving}
          />
        </div>
      </form>
    </div>
  );
}

export default function NewBroadcastPage() {
  return <BroadcastForm />;
}

NewBroadcastPage.getLayout = (page: ReactElement) => {
  return <PokeLayout>{page}</PokeLayout>;
};