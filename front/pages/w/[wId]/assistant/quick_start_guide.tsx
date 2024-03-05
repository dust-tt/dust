import {
  FolderIcon,
  GlobeAltIcon,
  Icon,
  Modal,
  Page,
  RocketIcon,
} from "@dust-tt/sparkle";
import { CloudArrowLeftRightIcon } from "@dust-tt/sparkle";

export function QuickStartGuide({
  show,
  onClose,
}: {
  show: boolean;
  onClose: () => void;
}) {
  return (
    <Modal
      isOpen={show}
      variant="full-screen"
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
              <Page.P>
                In Dust, you have access to{" "}
                <strong>multiple AI&nbsp;assistant</strong>.
              </Page.P>
              <Page.P>
                You can call an assistant by using{" "}
                <span className="italic">“"mentions"</span> (Typing{" "}
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
              <Page.P>
                The basic assistant is{" "}
                <span className="font-bold text-success-500">@gpt4</span>.
              </Page.P>
              <Page.P>
                It is a raw model. <span className="italic">““Raw”</span> means
                it does not have particular instructions or access to your
                knowledge.
              </Page.P>
              <Page.P>
                You also have access to assistants combining a model with
                specific instructions and access to&nbsp;knowledge.
                <br />
                <span className="font-bold">
                  They are created to answer specific questions,
                  really&nbsp;well.
                </span>
              </Page.P>
              <Page.P>
                Assistants can be provided by Dust, by your company (
                <span className="italic">Company assistants</span>), or by your
                coworkers (<span className="italic">Shared assistants</span>).
              </Page.P>
            </Page.Vertical>

            <Page.Vertical sizing="grow">
              <Page.H variant="h4">
                🛠️
                <br />
                How are Assistants made?
              </Page.H>
              <Page.P>You can build Assistants!</Page.P>
              <Page.P>
                Assistants are made of an “instruction”. A simple text,
                explaining what you want them to do. For instance,{" "}
                <span className="italic">“Act as a&nbsp;doctor”</span>,{" "}
                <span className="italic">“Summarise this document”</span>,{" "}
                <span className="italic">“What do you know about&nbsp;X”</span>.
              </Page.P>
              <Page.P>
                And you can give them access to knowledge.
                <br />
                We call them <span className="font-bold">Data sources.</span>
              </Page.P>
              <Page.P>
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
              What are
              <br />
              Data sources?
            </Page.H>
            <Page.P>
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
              <Page.P>
                Notion, Slack, Google Drive... Dust can connect to multiple
                platforms and make syncronise your data.
              </Page.P>
            </Page.Vertical>
            <Page.Vertical sizing="grow">
              <Page.Horizontal>
                <div className="flex items-center gap-2">
                  <Icon visual={FolderIcon} className="text-brand" />{" "}
                  <Page.H variant="h6">Folders</Page.H>
                </div>
              </Page.Horizontal>
              <Page.P>Upload files (text, pdf, csv) directly in Dust.</Page.P>
            </Page.Vertical>
            <Page.Vertical sizing="grow">
              <Page.Horizontal>
                <div className="flex items-center gap-2">
                  <Icon visual={GlobeAltIcon} className="text-brand" />{" "}
                  <Page.H variant="h6">Websites</Page.H>
                </div>
              </Page.Horizontal>
              <Page.P>
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
