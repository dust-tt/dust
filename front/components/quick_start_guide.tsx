import {
  FolderIcon,
  GlobeAltIcon,
  Icon,
  Modal,
  Page,
  RocketIcon,
} from "@dust-tt/sparkle";
import { CloudArrowLeftRightIcon } from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import { useEffect, useRef } from "react";

import type { UserResource } from "@app/lib/resources/user_resource";
import { ClientSideTracking } from "@app/lib/tracking/client";

export function QuickStartGuide({
  owner,
  user,
  show,
  onClose,
}: {
  owner: WorkspaceType;
  user: UserResource;
  show: boolean;
  onClose: () => void;
}) {
  const showedStartTimeRef = useRef<number | null>(null);

  useEffect(() => {
    // Track view duration on amplitude
    if (show) {
      showedStartTimeRef.current = Date.now();
    } else {
      if (showedStartTimeRef.current) {
        const duration = Date.now() - showedStartTimeRef.current;
        showedStartTimeRef.current = null;

        ClientSideTracking.trackQuickGuideViewed({
          user,
          workspace: owner,
          duration,
        });
      }
    }
  }, [owner, show, user]);

  return (
    <Modal
      isOpen={show}
      variant="side-md"
      hasChanged={false}
      onClose={onClose}
      title="Quick Guide"
    >
      <div className="mb-12">
        <Page>
          <Page.Header
            icon={RocketIcon}
            title={
              <>
                Get Started:
                <br />
                Quick Guide for new members
              </>
            }
          />

          <Page.Horizontal>
            <Page.Vertical sizing="grow">
              <Page.H variant="h4">
                👋 <br />
                Hello <span className="text-success-500">@mentions</span>
              </Page.H>
              <Page.P size="md">
                In Dust, you have access to{" "}
                <strong>multiple AI&nbsp;assistants</strong>.
              </Page.P>
              <Page.P size="md">
                You can call an assistant by using{" "}
                <span className="italic">“mentions”</span> (Typing{" "}
                <strong>"@"</strong> and the name of the assistant). You can
                even call several assistants at the same time and in the same
                thread.
              </Page.P>
            </Page.Vertical>
            <Page.Vertical sizing="grow">
              <img src="/static/quick_start_guide_input_bar.png" />
            </Page.Vertical>
          </Page.Horizontal>
          <Page.Horizontal>
            <Page.Vertical sizing="grow">
              <Page.H variant="h4">
                👩‍🎨🦸‍♀️🥷🧑‍🚀
                <br /> Why multiple Assistants?
              </Page.H>
              <Page.P size="md">
                <span className="font-bold">
                  Specialized assistants can help answer questions, really well.
                </span>
              </Page.P>
              <Page.P size="md">
                Assistants in Dust can be provided by Dust, by your company
                (Company assistants) or by your coworkers (Shared assistants).
              </Page.P>
              <Page.P size="md">
                Specialised assistants generally combine a model with specific
                instructions and access to knowledge.
              </Page.P>
              <Page.P size="md">
                Raw model assistants, without any particular instructions or
                access to your company knowledge are also available, like{" "}
                <span className="font-bold text-success-500">@gpt4</span>.
              </Page.P>
            </Page.Vertical>

            <Page.Vertical sizing="grow">
              <Page.H variant="h4">
                🛠️
                <br />
                Build your own Assistants
              </Page.H>
              <Page.P size="md">
                Assistants start with an “instruction”. A simple text,
                explaining what you want them to do.
              </Page.P>
              <Page.P size="md">
                For instance,{" "}
                <span className="italic">“Act as a&nbsp;doctor”</span>,{" "}
                <span className="italic">“Summarise this document”</span>,{" "}
                <span className="italic">“What do you know about&nbsp;X”</span>.
              </Page.P>
              <Page.P size="md">
                And you can give them access to knowledge.
                <br />
                We call them <span className="font-bold">Data sources.</span>
              </Page.P>
              <Page.P size="md">
                With the right Data source, assistants can answer questions like
                <span className="italic">
                  “Have we been working with company X”
                </span>
                , <span className="italic">“How do we manage expenses”</span>,{" "}
                <span className="italic">
                  “Write an intro email using the company tone of voice”...
                </span>
              </Page.P>
            </Page.Vertical>
          </Page.Horizontal>

          <Page.Vertical>
            <Page.H variant="h4">
              📚
              <br />
              What are Data sources?
            </Page.H>
            <Page.P size="md">
              To augment your assistants with knowledge, you give them data.
              <br /> Data can comes in different ways in Dust. Here are the
              three main ways.
            </Page.P>
          </Page.Vertical>
          <Page.Horizontal>
            <Page.Vertical sizing="grow">
              <div className="flex items-center gap-2">
                <Icon visual={CloudArrowLeftRightIcon} className="text-brand" />{" "}
                <Page.H variant="h6">Connections</Page.H>
              </div>
              <Page.P size="md">
                Notion, Slack, Google Drive... Dust can connect to multiple
                platforms and synchronize your data.
              </Page.P>
            </Page.Vertical>
            <Page.Vertical sizing="grow">
              <Page.Horizontal>
                <div className="flex items-center gap-2">
                  <Icon visual={FolderIcon} className="text-brand" />{" "}
                  <Page.H variant="h6">Folders</Page.H>
                </div>
              </Page.Horizontal>
              <Page.P size="md">
                Upload files (text, pdf, csv) directly in Dust.
              </Page.P>
            </Page.Vertical>
            <Page.Vertical sizing="grow">
              <Page.Horizontal>
                <div className="flex items-center gap-2">
                  <Icon visual={GlobeAltIcon} className="text-brand" />{" "}
                  <Page.H variant="h6">Websites</Page.H>
                </div>
              </Page.Horizontal>
              <Page.P size="md">
                Any public website can be synced in Dust. Think FAQ, wikipedia
                pages, documentation...
              </Page.P>
            </Page.Vertical>
          </Page.Horizontal>
        </Page>
      </div>
    </Modal>
  );
}
