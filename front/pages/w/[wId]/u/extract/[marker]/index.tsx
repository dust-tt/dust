import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import React from "react";
import { useState } from "react";
import { mutate } from "swr";

import { Button } from "@app/components/Button";
import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationLab } from "@app/components/sparkle/navigation";
import { getEventSchema } from "@app/lib/api/extract";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { APIError } from "@app/lib/error";
import { ModelId } from "@app/lib/models";
import { useExtractedEvents } from "@app/lib/swr";
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

  const schema = await getEventSchema(auth, context.params?.marker as string);
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
  const [isProcessing, setIsProcessing] = useState(false);
  const { events, isEventsLoading } = useExtractedEvents(owner, schema.marker);

  const handleDelete = async (eventId: ModelId) => {
    if (window.confirm("Are you sure you want to delete?")) {
      setIsProcessing(true);
      const res = await fetch(
        `/api/w/${owner.sId}/use/extract/${encodeURIComponent(
          schema.marker
        )}/events/${eventId}`,
        {
          method: "DELETE",
        }
      );
      if (res.ok) {
        await mutate(
          `/api/w/${owner.sId}/use/extract/${encodeURIComponent(schema.marker)}`
        );
      } else {
        const err = (await res.json()) as { error: APIError };
        window.alert(
          `Failed to delete: ${err.error.message} (Contact team@dust.tt for assistance).`
        );
      }
      setIsProcessing(false);
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
      <div className="flex h-full flex-col">
        <div className="container">
          <div className="mb-10 divide-y divide-gray-200">
            <div className="pb-6">
              <h3 className="text-base font-medium leading-6 text-gray-900">
                Extracted data for [[{schema.marker}]]
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Manage the list of extracted data for this marker.
              </p>
            </div>
            <div></div>
          </div>
          <div>
            <div className="my-5">
              <div className="overflow-x-auto sm:-mx-6 lg:-mx-8">
                <div className="inline-block min-w-full py-2 sm:px-6 lg:px-8">
                  <div className="overflow-hidden">
                    <table className="min-w-full text-left text-sm font-light">
                      <thead className="items-center border font-medium">
                        <tr>
                          <th scope="col" className="border px-4 py-4">
                            Extracted Data
                          </th>
                          <th scope="col" className="border px-4 py-4">
                            Manage this Data
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {!isEventsLoading &&
                          events.map((event) => (
                            <tr key={event.id} className="border">
                              <td className="border px-4 py-4 text-sm text-gray-500">
                                <EventProperties event={event} />
                              </td>
                              <td className="whitespace-nowrap border px-4 py-4 text-sm text-gray-500">
                                <div className="flex flex-col items-center gap-2">
                                  {event.documentSourceUrl !== null ? (
                                    <Button
                                      onClick={() => {
                                        window.open(
                                          event.documentSourceUrl || "",
                                          "_blank"
                                        );
                                      }}
                                      disabled={isProcessing}
                                    >
                                      Open source document
                                    </Button>
                                  ) : (
                                    <Button disabled={true}>
                                      Source document not available
                                    </Button>
                                  )}

                                  <Button
                                    onClick={async () => {
                                      await handleDelete(event.id);
                                    }}
                                    disabled={isProcessing}
                                  >
                                    Delete data
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
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
