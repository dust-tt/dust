import {
  ArrowUpOnSquareIcon,
  CheckCircleIcon,
  IconButton,
  PageHeader,
  PencilSquareIcon,
  SectionHeader,
  XCircleIcon,
} from "@dust-tt/sparkle";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import React from "react";
import { useState } from "react";
import { mutate } from "swr";

import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationLab } from "@app/components/sparkle/navigation";
import { getEventSchema } from "@app/lib/api/extract";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { APIError } from "@app/lib/error";
import { useExtractedEvents } from "@app/lib/swr";
import { classNames } from "@app/lib/utils";
import { DATA_SOURCE_INTEGRATIONS } from "@app/pages/w/[wId]/ds";
import { EventSchemaType, ExtractedEventType } from "@app/types/extract";
import { UserType, WorkspaceType } from "@app/types/user";

const { GA_TRACKING_ID = "" } = process.env;
export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  schema: EventSchemaType;
  readOnly: boolean;
  gaTrackingId: string;
}> = async (context) => {
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);
  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );
  const owner = auth.workspace();
  if (!owner) {
    return {
      notFound: true,
    };
  }

  const schema = await getEventSchema({
    auth,
    sId: context.params?.sId as string,
  });
  if (!schema) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      user,
      owner,
      schema,
      readOnly: !auth.isBuilder(),
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

export default function AppExtractEventsReadData({
  user,
  owner,
  schema,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const [isProcessing, setIsProcessing] = useState(false);
  const { events, isEventsLoading } = useExtractedEvents({
    owner,
    schemaSId: schema.sId,
  });

  const _handleUpdate = async (
    sId: string,
    status: "accepted" | "rejected"
  ) => {
    setIsProcessing(true);
    const res = await fetch(`/api/w/${owner.sId}/use/extract/events/${sId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      await mutate(
        `/api/w/${owner.sId}/use/extract/templates/${schema.sId}/events`
      );
    } else {
      const err = (await res.json()) as { error: APIError };
      window.alert(
        `Failed to delete: ${err.error.message} (Contact team@dust.tt for assistance).`
      );
    }
    setIsProcessing(false);
    return true;
  };

  const handleAccept = async (sId: string) => {
    await _handleUpdate(sId, "accepted");
  };

  const handleReject = async (sId: string) => {
    if (
      window.confirm(
        "Are you sure you want to reject? You won't be able to access it anymore"
      )
    ) {
      await _handleUpdate(sId, "rejected");
      return true;
    } else {
      return false;
    }
  };

  return (
    <AppLayout
      user={user}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="lab"
      subNavigation={subNavigationLab({ owner, current: "extract" })}
    >
      <PageHeader
        title="Extract"
        icon={ArrowUpOnSquareIcon}
        description="Extract is your go-to tool for capturing structured data
        effortlessly within your notes. Use Extract markers to specify sections in your notes that you want to revisit or analyze. No more scrolling and searching!"
      />

      <div className="text-sm font-light">
        <SectionHeader
          title={`Extracted data for [[${schema.marker}]]`}
          description="Review the extracted data for this marker. You can accept or reject the data, and consult the source document."
        />

        <div className="my-4 min-w-full py-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <table>
            <tbody>
              {!isEventsLoading &&
                events.map((event: ExtractedEventType) => (
                  <tr key={event.id} className="border-y">
                    <td
                      className={classNames(
                        "w-full px-4 py-4",
                        event.status === "pending"
                          ? "text-gray-400"
                          : "text-gray-900"
                      )}
                    >
                      <EventProperties event={event} />
                    </td>
                    <td className="w-auto border-y px-4 py-4 text-right align-top">
                      <div className="flex flex-row space-x-2">
                        {event.status === "pending" && (
                          <span>Needs&nbsp;review!</span>
                        )}
                        {event.status === "accepted" && <span>Approved!</span>}
                      </div>
                    </td>
                    <td className="w-auto border-y px-4 py-4 align-top">
                      <div className="flex flex-row space-x-2">
                        <IconButton
                          icon={CheckCircleIcon}
                          tooltip="Accept data"
                          type={
                            event.status === "pending" ? "primary" : "tertiary"
                          }
                          onClick={async () => {
                            await handleAccept(event.sId);
                          }}
                          disabled={isProcessing || event.status === "accepted"}
                          className="ml-1"
                        />

                        <IconButton
                          icon={PencilSquareIcon}
                          tooltip="Edit data"
                          type={
                            event.status === "pending" ? "primary" : "tertiary"
                          }
                          onClick={() =>
                            router.push(
                              `/w/${owner.sId}/u/extract/events/${event.sId}/edit`
                            )
                          }
                          disabled={isProcessing}
                          className="ml-1"
                        />

                        <IconButton
                          icon={XCircleIcon}
                          tooltip="Reject data"
                          type={
                            event.status === "pending" ? "warning" : "tertiary"
                          }
                          onClick={async () => {
                            await handleReject(event.sId);
                          }}
                          disabled={isProcessing}
                          className="ml-1"
                        />
                      </div>
                    </td>
                    <td className="w-auto border-y py-4 align-top">
                      <EventDataSourceLogo event={event} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}

const EventProperties = ({ event }: { event: ExtractedEventType }) => {
  const properties = event.properties;

  const renderValue = (value: string | string[]) => {
    if (typeof value === "string") {
      return <p>{value}</p>;
    }

    const isStringArray = (value: string | string[]) =>
      Array.isArray(value) && value.every((item) => typeof item === "string");
    if (isStringArray(value)) {
      return (
        <ul className="list-inside list-disc">
          {value.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      );
    }

    return null;
  };

  return (
    <div className="space-y-4">
      {Object.entries(properties).map(([key, value]) => (
        <div key={key} className="flex flex-col">
          <span className="font-bold">{key}</span>
          {renderValue(value)}
        </div>
      ))}
    </div>
  );
};

const EventDataSourceLogo = ({ event }: { event: ExtractedEventType }) => {
  let providerLogo = null;
  if (event.dataSourceName.includes("notion")) {
    providerLogo = DATA_SOURCE_INTEGRATIONS.notion.logoPath;
  } else if (event.dataSourceName.includes("google_drive")) {
    providerLogo = DATA_SOURCE_INTEGRATIONS.google_drive.logoPath;
  } else if (event.dataSourceName.includes("github")) {
    providerLogo = DATA_SOURCE_INTEGRATIONS.github.logoPath;
  } else if (event.dataSourceName.includes("slack")) {
    providerLogo = DATA_SOURCE_INTEGRATIONS.slack.logoPath;
  }

  return (
    <>
      {event.documentSourceUrl && providerLogo ? (
        <div className="flex items-center space-x-2">
          <a
            href={event.documentSourceUrl}
            target="_blank"
            className="block h-5 w-5"
          >
            <img
              className="block h-5 w-5"
              src={providerLogo}
              alt="Link to source document"
            />
          </a>
        </div>
      ) : (
        <p>Unknown source</p>
      )}
    </>
  );
};
