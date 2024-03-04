import { ArrowUpOnSquareIcon, Button, Page } from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import type { EventSchemaType, ExtractedEventType } from "@dust-tt/types";
import type { SubscriptionType } from "@dust-tt/types";
import type { APIError } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import React, { useEffect, useRef, useState } from "react";

import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationBuild } from "@app/components/sparkle/navigation";
import { getEventSchema, getExtractedEvent } from "@app/lib/api/extract";
import { Authenticator, getSession } from "@app/lib/auth";
import { withGetServerSidePropsRequirements } from "@app/lib/iam/session";
import { classNames } from "@app/lib/utils";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps = withGetServerSidePropsRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  event: ExtractedEventType;
  schema: EventSchemaType;
  readOnly: boolean;
  gaTrackingId: string;
}>(async (context) => {
  const session = await getSession(context.req, context.res);
  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );

  const owner = auth.workspace();
  const subscription = auth.subscription();

  if (!owner || !auth.isBuilder() || !subscription) {
    return {
      notFound: true,
    };
  }

  const event = await getExtractedEvent({
    auth,
    sId: context.params?.sId as string,
  });
  if (!event) {
    return {
      notFound: true,
    };
  }

  const schema = await getEventSchema({
    auth,
    sId: event.schema.sId,
  });

  if (!schema) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner,
      subscription,
      event,
      schema,
      readOnly: !auth.isBuilder(),
      gaTrackingId: GA_TRACKING_ID,
    },
  };
});

export default function AppExtractEventsCreate({
  owner,
  subscription,
  event,
  readOnly,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <AppLayout
      subscription={subscription}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="assistants"
      subNavigation={subNavigationBuild({ owner, current: "extract" })}
    >
      <Page.Header
        title="Extract"
        icon={ArrowUpOnSquareIcon}
        description="Extract is your go-to tool for capturing structured data
        effortlessly within your notes. Use Extract markers to specify sections in your notes that you want to revisit or analyze. No more scrolling and searching!"
      />
      <div>
        <Page.SectionHeader
          title="Edit extract data"
          description="Edit the extracted data to correct any missing or wrong information. Apologies for the raw JSON, tool is still beta!"
        />

        <div className="mt-6">
          <BasicEventPropsEditor
            event={event}
            owner={owner}
            readOnly={readOnly}
          />
        </div>
      </div>
    </AppLayout>
  );
}

const BasicEventPropsEditor = ({
  event,
  owner,
  readOnly,
}: {
  event: ExtractedEventType;
  owner: WorkspaceType;
  readOnly: boolean;
}) => {
  const [jsonText, setJsonText] = useState(
    JSON.stringify(event.properties, null, 4)
  );
  const router = useRouter();
  const [isValid, setIsValid] = useState(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Auto resize text area
  const textAreaRef = useRef(null) as any;
  useEffect(() => {
    const textArea = textAreaRef.current;
    if (!textArea) {
      return;
    }
    textArea.style.height = "auto";
    textArea.style.height = `${textArea.scrollHeight}px`;
  }, [jsonText]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newJsonText = e.target.value;
    setJsonText(newJsonText);
    try {
      JSON.parse(newJsonText);
      setIsValid(true);
    } catch (error) {
      setIsValid(false);
    }
  };

  const onSubmit = async () => {
    setIsProcessing(true);
    const res = await fetch(
      `/api/w/${owner.sId}/use/extract/events/${event.sId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ properties: jsonText, status: "accepted" }),
      }
    );
    if (res.ok) {
      await router.push(
        `/w/${owner.sId}/u/extract/templates/${event.schema.sId}`
      );
    } else {
      const err = (await res.json()) as { error: APIError };
      window.alert(
        `Failed to update: ${err.error.message} (Contact team@dust.tt for assistance).`
      );
    }
    setIsProcessing(false);
  };

  return (
    <div>
      <textarea
        ref={textAreaRef}
        className={classNames(
          "w-full rounded-md border",
          isValid ? "border-gray-300" : "border-red-500"
        )}
        value={jsonText}
        onChange={handleChange}
        disabled={readOnly}
      />
      <p className="mt-6 text-sm">{isValid ? "Valid JSON" : "Invalid JSON"}</p>
      <Button
        className="mt-6"
        variant="primary"
        label={isProcessing ? "Submitting..." : "Submit"}
        disabled={!isValid || readOnly}
        onClick={async () => {
          await onSubmit();
        }}
      />
      <Button
        onClick={() =>
          router.push(`/w/${owner.sId}/u/extract/templates/${event.schema.sId}`)
        }
        label="Back"
        variant="secondary"
      />
    </div>
  );
};
