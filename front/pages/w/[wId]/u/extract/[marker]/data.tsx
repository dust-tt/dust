import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import React from "react";

import AppLayout from "@app/components/AppLayout";
import { Button } from "@app/components/Button";
import MainTab from "@app/components/use/MainTab";
import { getEventSchema, getExtractedEvents } from "@app/lib/api/extract";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { EventSchemaType, ExtractedEventType } from "@app/types/extract";
import { UserType, WorkspaceType } from "@app/types/user";

const { GA_TRACKING_ID = "" } = process.env;
export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  schema: EventSchemaType;
  events: ExtractedEventType[];
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

  const events = await getExtractedEvents(auth, schema.id);
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
      events,
      readOnly: !auth.isBuilder(),
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

export default function AppExtractEventsReadData({
  user,
  owner,
  schema,
  events,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <AppLayout
      user={user}
      owner={owner}
      gaTrackingId={gaTrackingId}
      app={undefined}
      dataSource={undefined}
    >
      <div className="flex h-full flex-col">
        <div className="mt-2 flex flex-initial">
          <MainTab currentTab="Extract" owner={owner} />
        </div>

        <div className="container mx-auto my-10 sm:max-w-3xl lg:max-w-4xl xl:max-w-5xl">
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
                      <thead className="border font-medium">
                        <tr>
                          <th scope="col" className="border px-12 py-4">
                            Properties
                          </th>
                          <th scope="col" className="border px-3 py-4">
                            Source Document
                          </th>
                          <th scope="col" className="border px-3 py-4">
                            Manage
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {events.map((event) => (
                          <tr key={event.id} className="border">
                            <td className="border px-3 py-4 text-sm text-gray-500">
                              <EventProperties event={event} />
                            </td>
                            <td className="whitespace-nowrap border px-3 py-4 text-sm text-gray-500">
                              {event.documentSourceUrl !== null ? (
                                <Button
                                  onClick={() => {
                                    window.open(
                                      event.documentSourceUrl || "",
                                      "_blank"
                                    );
                                  }}
                                >
                                  See doc
                                </Button>
                              ) : (
                                <p>Not available</p>
                              )}
                            </td>
                            <td className="whitespace-nowrap border px-3 py-4 text-sm text-gray-500">
                              [todo]
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
