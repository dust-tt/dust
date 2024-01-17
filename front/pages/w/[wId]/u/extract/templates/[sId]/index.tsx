import {
  ArrowUpOnSquareIcon,
  Button,
  CheckCircleIcon,
  ClipboardCheckIcon,
  IconButton,
  LinkStrokeIcon,
  Page,
  PencilSquareIcon,
  XCircleIcon,
} from "@dust-tt/sparkle";
import type { UserType, WorkspaceType } from "@dust-tt/types";
import type { EventSchemaType, ExtractedEventType } from "@dust-tt/types";
import type { SubscriptionType } from "@dust-tt/types";
import type { APIError } from "@dust-tt/types";
import { Dialog, Transition } from "@headlessui/react";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { Fragment, useState } from "react";
import { useSWRConfig } from "swr";

import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationAdmin } from "@app/components/sparkle/navigation";
import { getEventSchema } from "@app/lib/api/extract";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { useExtractedEvents } from "@app/lib/swr";
import { classNames, objectToMarkdown } from "@app/lib/utils";

const { GA_TRACKING_ID = "" } = process.env;
export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  subscription: SubscriptionType;
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
  const subscription = auth.subscription();
  if (!owner || !subscription) {
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
      subscription,
      schema,
      readOnly: !auth.isBuilder(),
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

export default function AppExtractEventsReadData({
  user,
  owner,
  subscription,
  schema,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const { mutate } = useSWRConfig();

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
      subscription={subscription}
      user={user}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="admin"
      subNavigation={subNavigationAdmin({ owner, current: "extract" })}
    >
      <Page.Header
        title="Extract"
        icon={ArrowUpOnSquareIcon}
        description="Extract is your go-to tool for capturing structured data
        effortlessly within your notes. Use Extract markers to specify sections in your notes that you want to revisit or analyze. No more scrolling and searching!"
      />

      <div className="pb-10 text-sm font-light">
        <Page.SectionHeader
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
                      <Link
                        href={`/w/${owner.sId}/u/extract/events/${event.sId}/edit`}
                        className="block"
                      >
                        <EventProperties event={event} />
                      </Link>
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
                        <ExtractButtonAndModal event={event} />

                        <IconButton
                          icon={CheckCircleIcon}
                          tooltip="Accept data"
                          variant={
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
                          variant={
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
                          variant={
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
        <Button
          onClick={() => router.push(`/w/${owner.sId}/u/extract`)}
          label="Back"
          variant="secondary"
        />
      </div>
    </AppLayout>
  );
}

// In schema properties are stored as an array of objects
// Example: [
//   {"name": "name", "type": "string", "description": "Name of the idea"}]
//   {"name": "author", "type": "string", "description": "Author of the idea "}
// ]
// In event properties are stored as an object with undefined order as it is a JSONB column
// Example: {"name": "My idea", "author": "Michael Scott"}
const EventProperties = ({ event }: { event: ExtractedEventType }) => {
  const renderPropertyValue = (value: string | string[]) => {
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
      {Object.keys(event.properties).map((key) => (
        <div key={key} className="flex flex-col">
          <span className="font-bold">{key}</span>
          {renderPropertyValue(event.properties[key])}
        </div>
      ))}
    </div>
  );
};

const EventDataSourceLogo = ({ event }: { event: ExtractedEventType }) => {
  let providerLogo = null;
  if (event.dataSourceName.includes("notion")) {
    providerLogo = CONNECTOR_CONFIGURATIONS.notion.logoPath;
  } else if (event.dataSourceName.includes("google_drive")) {
    providerLogo = CONNECTOR_CONFIGURATIONS.google_drive.logoPath;
  } else if (event.dataSourceName.includes("github")) {
    providerLogo = CONNECTOR_CONFIGURATIONS.github.logoPath;
  } else if (event.dataSourceName.includes("slack")) {
    providerLogo = CONNECTOR_CONFIGURATIONS.slack.logoPath;
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

const ExtractButtonAndModal = ({ event }: { event: ExtractedEventType }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);

  const handleClick = async (format: "JSON" | "Markdown"): Promise<void> => {
    let content: string | null = null;

    if (format === "JSON") {
      content = JSON.stringify(event.properties);
    }
    if (format === "Markdown") {
      content = objectToMarkdown(event.properties);
    }

    if (!content) {
      return;
    }

    await navigator.clipboard.writeText(content);
    setCopySuccess(format);
    setTimeout(() => {
      setCopySuccess(null);
    }, 1000);
  };

  return (
    <>
      <IconButton
        size="sm"
        icon={ArrowUpOnSquareIcon}
        variant="primary"
        tooltip="Copy data"
        onClick={() => setIsOpen(true)}
      />

      <Transition show={isOpen} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-10"
          onClose={() => setIsOpen(false)}
        >
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black bg-opacity-25" />
          </Transition.Child>
          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 text-center">
              <Transition.Child
                as={Fragment}
                enter="transition ease-out duration-200"
                enterFrom="transform -translate-y-4 opacity-0 scale-100"
                enterTo="transform opacity-100 scale-100"
                leave="transition ease-in duration-75"
                leaveFrom="transform opacity-100 scale-100"
                leaveTo="transform opacity-0 scale-95"
              >
                <Dialog.Panel className="mx-16 mt-16 w-64 rounded-md bg-white py-1 shadow-lg ring-1 ring-slate-100 focus:outline-none">
                  <div className="flex flex-col gap-y-2 px-3 py-3">
                    <div className="text-sm font-medium text-element-800">
                      Extract this item
                    </div>
                    <div className="text-xs font-normal text-element-700">
                      Copy to clipboard in the desired format!
                    </div>
                    <div className="justify-center">
                      <Button
                        variant="secondary"
                        size="sm"
                        label={
                          copySuccess === "Markdown"
                            ? "Copied!"
                            : "Copy as Markdown"
                        }
                        icon={
                          copySuccess === "Markdown"
                            ? ClipboardCheckIcon
                            : LinkStrokeIcon
                        }
                        onClick={() => handleClick("Markdown")}
                      />
                    </div>
                    <div className="justify-center">
                      <Button
                        variant="secondary"
                        size="sm"
                        label={
                          copySuccess === "JSON" ? "Copied!" : "Copy as JSON"
                        }
                        icon={
                          copySuccess === "JSON"
                            ? ClipboardCheckIcon
                            : LinkStrokeIcon
                        }
                        onClick={() => handleClick("JSON")}
                      />
                    </div>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </>
  );
};
