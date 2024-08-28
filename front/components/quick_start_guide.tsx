import {
  CardButton,
  FolderIcon,
  GlobeAltIcon,
  Icon,
  Modal,
  Page,
} from "@dust-tt/sparkle";
import { CloudArrowLeftRightIcon } from "@dust-tt/sparkle";
import type { UserType, WorkspaceType } from "@dust-tt/types";
import { useEffect, useRef } from "react";

import { ClientSideTracking } from "@app/lib/tracking/client";

export function QuickStartGuide({
  owner,
  user,
  show,
  onClose,
}: {
  owner: WorkspaceType;
  user: UserType;
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
      title="🚀 Getting started with Dust"
    >
      <div className="pb-5">
        <Page>
          <div className="px-5">
            <div className="w-full">
              <div className="relative w-full overflow-hidden rounded-lg pb-[56.20%]">
                <iframe
                  src="https://fast.wistia.net/embed/iframe/j7w4t4ysr3?seo=true&videoFoam=false"
                  title="Dust product tour"
                  allow="autoplay; fullscreen"
                  frameBorder="0"
                  className="absolute left-0 top-0 h-full w-full rounded-lg"
                ></iframe>
              </div>
            </div>
          </div>

          <Page.Vertical sizing="grow">
            <Page.H variant="h5">
              👋 Hello <span className="text-success-500">@assistants</span>
            </Page.H>
            <CardButton variant="secondary">
              <Page.Vertical sizing="grow">
                <Page.P size="md">
                  In Dust, you have access to{" "}
                  <strong>multiple AI&nbsp;assistants</strong>.
                </Page.P>
                <Page.P size="sm">
                  You can call an assistant by typing <strong>"@"</strong> and
                  the name of the assistant. You can even call several
                  assistants at the same time or chain them in one conversation.
                </Page.P>
              </Page.Vertical>
              <Page.Vertical sizing="grow">
                <img src="/static/quick_start_guide_input_bar.png" />
              </Page.Vertical>
            </CardButton>
          </Page.Vertical>

          <Page.Horizontal>
            <Page.Vertical sizing="grow">
              <Page.H variant="h5">👩‍🎨🦸‍♀️🥷🧑‍🚀 Multiple Assistants</Page.H>

              <CardButton variant="secondary">
                <Page.Vertical>
                  <Page.P size="md">
                    <span className="font-bold">
                      Specialized assistants can help answer questions, really
                      well.
                    </span>
                  </Page.P>

                  <Page.P size="sm">
                    Assistants in Dust can be provided by Dust, by your company
                    (Company assistants) or by your coworkers (Shared
                    assistants).
                  </Page.P>
                  <Page.P size="sm">
                    Specialised assistants generally combine a model with
                    specific instructions and access to knowledge.
                  </Page.P>
                  <Page.P size="sm">
                    Raw model assistants, without any particular instructions or
                    access to your company knowledge are also available, like{" "}
                    <span className="font-bold text-success-500">@gpt4</span>.
                  </Page.P>
                </Page.Vertical>
              </CardButton>
            </Page.Vertical>

            <Page.Vertical sizing="grow">
              <Page.H variant="h5">🛠️ Build your own Assistants</Page.H>
              <CardButton variant="secondary">
                <Page.Vertical>
                  <Page.P size="md">
                    <span className="font-bold">
                      Assistants start with an “instruction”: a text telling
                      what you want them to do.
                    </span>
                  </Page.P>

                  <Page.P size="sm">
                    For instance,{" "}
                    <span className="italic">“Act as a&nbsp;doctor”</span>,{" "}
                    <span className="italic">“Summarise this document”</span>,{" "}
                    <span className="italic">
                      “What do you know about&nbsp;X”
                    </span>
                    .
                  </Page.P>
                  <Page.P size="sm">
                    And you can give them access to knowledge.
                    <br />
                    We call them{" "}
                    <span className="font-bold">Data sources.</span>
                  </Page.P>
                  <Page.P size="sm">
                    With the right Data source, assistants can answer questions
                    like
                    <span className="italic">
                      “Have we been working with company X”
                    </span>
                    ,{" "}
                    <span className="italic">“How do we manage expenses”</span>,{" "}
                    <span className="italic">
                      “Write an intro email using the company tone of voice”...
                    </span>
                  </Page.P>
                </Page.Vertical>
              </CardButton>
            </Page.Vertical>
          </Page.Horizontal>

          <Page.Vertical>
            <Page.H variant="h5">📚 What are Data sources?</Page.H>
            <Page.P size="sm">
              To augment your assistants with knowledge, you give them data in
              three ways:
            </Page.P>
          </Page.Vertical>

          <CardButton variant="secondary" className="block">
            <Page.Horizontal>
              <Page.Vertical sizing="grow">
                <div className="flex items-center gap-2">
                  <Icon
                    visual={CloudArrowLeftRightIcon}
                    className="text-brand"
                  />{" "}
                  <Page.H variant="h6">Connections</Page.H>
                </div>
                <Page.P size="sm">
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
                <Page.P size="sm">
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
                <Page.P size="sm">
                  Any public website can be synced in Dust. Think FAQ, wikipedia
                  pages, documentation...
                </Page.P>
              </Page.Vertical>
            </Page.Horizontal>
          </CardButton>
        </Page>
      </div>
    </Modal>
  );
}
