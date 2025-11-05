import {
  Button,
  CloudIcon,
  EyeIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from "@dust-tt/sparkle";
import { format } from "date-fns";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";

import PokeLayout from "@app/components/poke/PokeLayout";
import {
  PokeTable,
  PokeTableBody,
  PokeTableCell,
  PokeTableHead,
  PokeTableHeader,
  PokeTableRow,
} from "@app/components/poke/shadcn/ui/table";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import type { BroadcastType } from "@app/pages/api/poke/broadcasts/index";
import Link from "next/link";

export const getServerSideProps = withSuperUserAuthRequirements<object>(
  async () => {
    return {
      props: {},
    };
  }
);

function BroadcastsList() {
  const [broadcasts, setBroadcasts] = useState<BroadcastType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBroadcasts();
  }, []);

  const fetchBroadcasts = async () => {
    try {
      const response = await fetch("/api/poke/broadcasts");
      if (response.ok) {
        const data = await response.json();
        setBroadcasts(data.broadcasts);
      }
    } catch (error) {
      console.error("Failed to fetch broadcasts:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (broadcastId: string) => {
    if (!confirm("Are you sure you want to delete this broadcast?")) {
      return;
    }

    try {
      const response = await fetch(`/api/poke/broadcasts/${broadcastId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        await fetchBroadcasts();
      } else {
        alert("Failed to delete broadcast");
      }
    } catch (error) {
      console.error("Failed to delete broadcast:", error);
      alert("Failed to delete broadcast");
    }
  };

  const handlePublish = async (broadcastId: string) => {
    if (!confirm("Are you sure you want to publish this broadcast?")) {
      return;
    }

    try {
      const response = await fetch(`/api/poke/broadcasts/${broadcastId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "published" }),
      });

      if (response.ok) {
        await fetchBroadcasts();
      } else {
        alert("Failed to publish broadcast");
      }
    } catch (error) {
      console.error("Failed to publish broadcast:", error);
      alert("Failed to publish broadcast");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "draft":
        return "bg-gray-500";
      case "scheduled":
        return "bg-blue-500";
      case "published":
        return "bg-green-500";
      case "expired":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-lg">Loading broadcasts...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Broadcasts</h1>
        <Link href="/poke/broadcasts/new">
          <Button
            variant="primary"
            size="sm"
            label="New Broadcast"
            icon={PlusIcon}
          />
        </Link>
      </div>

      <PokeTable>
        <PokeTableHead>
          <PokeTableRow>
            <PokeTableHeader>Status</PokeTableHeader>
            <PokeTableHeader>Title</PokeTableHeader>
            <PokeTableHeader>Description</PokeTableHeader>
            <PokeTableHeader>Targeting</PokeTableHeader>
            <PokeTableHeader>Start Date</PokeTableHeader>
            <PokeTableHeader>Options</PokeTableHeader>
            <PokeTableHeader>Actions</PokeTableHeader>
          </PokeTableRow>
        </PokeTableHead>
        <PokeTableBody>
          {broadcasts.map((broadcast) => (
            <PokeTableRow key={broadcast.sId}>
              <PokeTableCell>
                <span
                  className={`inline-block rounded px-2 py-1 text-xs text-white ${getStatusColor(
                    broadcast.status
                  )}`}
                >
                  {broadcast.status}
                </span>
              </PokeTableCell>
              <PokeTableCell className="max-w-xs">
                <div className="font-medium">{broadcast.title}</div>
                <div className="text-xs text-gray-500">{broadcast.sId}</div>
              </PokeTableCell>
              <PokeTableCell className="max-w-xs">
                <div className="truncate text-sm">
                  {broadcast.shortDescription}
                </div>
              </PokeTableCell>
              <PokeTableCell>
                <div className="text-sm">
                  {broadcast.targetingType === "all"
                    ? "All users"
                    : broadcast.targetingType}
                </div>
                {broadcast.targetingData && (
                  <div className="text-xs text-gray-500">
                    {broadcast.targetingType === "plans" &&
                      broadcast.targetingData.planCodes?.join(", ")}
                    {broadcast.targetingType === "workspaces" &&
                      `${broadcast.targetingData.workspaceIds?.length} workspaces`}
                    {broadcast.targetingType === "users" &&
                      `${broadcast.targetingData.userIds?.length} users`}
                  </div>
                )}
              </PokeTableCell>
              <PokeTableCell>
                <div className="text-sm">
                  {format(new Date(broadcast.startDate), "MMM d, yyyy")}
                </div>
                {broadcast.endDate && (
                  <div className="text-xs text-gray-500">
                    to {format(new Date(broadcast.endDate), "MMM d, yyyy")}
                  </div>
                )}
              </PokeTableCell>
              <PokeTableCell>
                <div className="flex flex-col gap-1 text-xs">
                  {broadcast.shouldBroadcast && (
                    <span className="text-blue-600">📢 In-app</span>
                  )}
                  {broadcast.publishToChangelog && (
                    <span className="text-green-600">📝 Changelog</span>
                  )}
                  {broadcast.mediaUrl && (
                    <span className="text-purple-600">🖼️ Media</span>
                  )}
                </div>
              </PokeTableCell>
              <PokeTableCell>
                <div className="flex gap-2">
                  {broadcast.publishToChangelog && (
                    <Link
                      href="/changelog"
                      target="_blank"
                      className="text-blue-500 hover:text-blue-700"
                    >
                      <EyeIcon className="h-4 w-4" />
                    </Link>
                  )}
                  <Link
                    href={`/poke/broadcasts/${broadcast.sId}`}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    <PencilIcon className="h-4 w-4" />
                  </Link>
                  {broadcast.status === "draft" && (
                    <button
                      onClick={() => handlePublish(broadcast.sId)}
                      className="text-green-500 hover:text-green-700"
                    >
                      <CloudIcon className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(broadcast.sId)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </PokeTableCell>
            </PokeTableRow>
          ))}
          {broadcasts.length === 0 && (
            <PokeTableRow>
              <PokeTableCell colSpan={7} className="text-center">
                No broadcasts found. Create your first broadcast!
              </PokeTableCell>
            </PokeTableRow>
          )}
        </PokeTableBody>
      </PokeTable>
    </div>
  );
}

export default function BroadcastsPage() {
  return <BroadcastsList />;
}

BroadcastsPage.getLayout = (page: ReactElement) => {
  return <PokeLayout>{page}</PokeLayout>;
};