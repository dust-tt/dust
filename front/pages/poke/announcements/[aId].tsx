import { Spinner } from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import type { ReactElement } from "react";

import { AnnouncementForm } from "@app/components/poke/announcements/form";
import PokeLayout from "@app/components/poke/PokeLayout";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import { usePokeAnnouncement } from "@app/poke/swr/announcements";

export const getServerSideProps = withSuperUserAuthRequirements<object>(
  async () => {
    return {
      props: {},
    };
  }
);

export default function EditAnnouncementPage() {
  const router = useRouter();
  const { aId } = router.query;

  const { announcement, isLoading, isError } = usePokeAnnouncement({
    aId: typeof aId === "string" ? aId : null,
  });

  const handleSubmit = async (data: {
    type: string;
    slug: string;
    title: string;
    description: string;
    content: string;
    status: "draft" | "published";
    publishedAt: string;
    showInAppBanner: boolean;
    eventDate: string;
    eventTimezone: string;
    eventLocation: string;
    eventUrl: string;
    categories: string;
    tags: string;
    imageFileId?: string | null;
  }) => {
    const response = await fetch(`/api/poke/announcements/${aId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        slug: data.slug,
        title: data.title,
        description: data.description,
        content: data.content,
        isPublished: data.status === "published",
        publishedAt: data.publishedAt || null,
        showInAppBanner: data.showInAppBanner,
        eventDate: data.eventDate || null,
        eventTimezone: data.eventTimezone || null,
        eventLocation: data.eventLocation || null,
        eventUrl: data.eventUrl || null,
        categories: data.categories ? [data.categories] : null,
        tags: null,
        imageFileId: data.imageFileId || null,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to update announcement");
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this announcement?")) {
      return;
    }

    const response = await fetch(`/api/poke/announcements/${aId}`, {
      method: "DELETE",
    });

    if (response.ok) {
      void router.push("/poke/announcements");
    } else {
      alert("Failed to delete announcement");
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" variant="color" />
      </div>
    );
  }

  if (isError || !announcement) {
    return (
      <div className="mx-auto h-full w-full max-w-4xl flex-grow flex-col p-8 pt-8">
        <div className="text-red-500">Error loading announcement</div>
      </div>
    );
  }

  return (
    <div className="mx-auto h-full w-full max-w-4xl flex-grow flex-col p-8 pt-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Edit Announcement</h1>
        <button
          onClick={handleDelete}
          className="text-red-500 hover:text-red-700"
        >
          Delete
        </button>
      </div>
      <AnnouncementForm announcement={announcement} onSubmit={handleSubmit} />
    </div>
  );
}

EditAnnouncementPage.getLayout = (page: ReactElement) => {
  return <PokeLayout title="Edit Announcement">{page}</PokeLayout>;
};
