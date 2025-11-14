import { useRouter } from "next/router";
import type { ReactElement } from "react";

import { AnnouncementForm } from "@app/components/poke/announcements/form";
import PokeLayout from "@app/components/poke/PokeLayout";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import { isString } from "@app/types";
import type { AnnouncementType } from "@app/types/announcement";
import { ANNOUNCEMENT_TYPES } from "@app/types/announcement";

export const getServerSideProps = withSuperUserAuthRequirements<object>(
  async () => {
    return {
      props: {},
    };
  }
);

function isAnnouncementType(value: string): value is AnnouncementType {
  return ANNOUNCEMENT_TYPES.some((type) => type === value);
}

function getAnnouncementTypeFromQuery(
  value: string | string[] | undefined
): AnnouncementType | undefined {
  if (!isString(value)) {
    return undefined;
  }
  return isAnnouncementType(value) ? value : undefined;
}

export default function NewAnnouncementPage() {
  const router = useRouter();
  const { type } = router.query;
  const typeFromQuery = getAnnouncementTypeFromQuery(type);

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
    const response = await fetch("/api/poke/announcements", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: data.type,
        slug: data.slug,
        title: data.title,
        description: data.description,
        content: data.content,
        isPublished: data.status === "published",
        publishedAt: data.publishedAt ?? null,
        showInAppBanner: data.showInAppBanner,
        eventDate: data.eventDate ?? null,
        eventTimezone: data.eventTimezone ?? null,
        eventLocation: data.eventLocation ?? null,
        eventUrl: data.eventUrl ?? null,
        categories: data.categories ? [data.categories] : null,
        tags: null,
        imageFileId: data.imageFileId ?? null,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to create announcement");
    }
  };

  return (
    <div className="mx-auto h-full w-full max-w-4xl flex-grow flex-col p-8 pt-8">
      <h1 className="mb-6 text-2xl font-bold">Create New Announcement</h1>
      <AnnouncementForm onSubmit={handleSubmit} initialType={typeFromQuery} />
    </div>
  );
}

NewAnnouncementPage.getLayout = (page: ReactElement) => {
  return <PokeLayout title="New Announcement">{page}</PokeLayout>;
};
