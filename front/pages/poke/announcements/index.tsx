import { Button, Tabs, TabsList, TabsTrigger } from "@dust-tt/sparkle";
import Link from "next/link";
import type { ReactElement } from "react";
import { useState } from "react";

import { makeColumnsForAnnouncements } from "@app/components/poke/announcements/columns";
import PokeLayout from "@app/components/poke/PokeLayout";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import { usePokeAnnouncements } from "@app/poke/swr/announcements";
import type { AnnouncementType } from "@app/types/announcement";

export const getServerSideProps = withSuperUserAuthRequirements<object>(
  async () => {
    return {
      props: {},
    };
  }
);

export default function AnnouncementsPage() {
  const [selectedTab, setSelectedTab] = useState<"all" | AnnouncementType>(
    "all"
  );

  const { announcements, isLoading, isError } = usePokeAnnouncements({
    type: selectedTab === "all" ? undefined : selectedTab,
  });

  return (
    <div className="mx-auto h-full w-full max-w-7xl flex-grow flex-col p-8 pt-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Announcements</h1>
        <div className="flex gap-2">
          <Link href="/poke/announcements/new?type=event">
            <Button variant="outline" size="sm" label="Create Event" />
          </Link>
          <Link href="/poke/announcements/new?type=changelog">
            <Button variant="highlight" size="sm" label="Create Changelog" />
          </Link>
        </div>
      </div>

      <Tabs value={selectedTab} className="mb-6">
        <TabsList>
          <TabsTrigger
            value="all"
            label="All"
            onClick={() => setSelectedTab("all")}
          />
          <TabsTrigger
            value="changelog"
            label="Changelog"
            onClick={() => setSelectedTab("changelog")}
          />
          <TabsTrigger
            value="event"
            label="Events"
            onClick={() => setSelectedTab("event")}
          />
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div>Loading...</div>
      ) : isError ? (
        <div>Error loading announcements</div>
      ) : (
        <PokeDataTable
          columns={makeColumnsForAnnouncements()}
          data={announcements}
        />
      )}
    </div>
  );
}

AnnouncementsPage.getLayout = (page: ReactElement) => {
  return <PokeLayout title="Announcements">{page}</PokeLayout>;
};
