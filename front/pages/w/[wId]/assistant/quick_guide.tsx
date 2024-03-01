import {
  CloudArrowLeftRightIcon,
  Icon,
  Modal,
  Page,
  RocketIcon,
} from "@dust-tt/sparkle";

export function QuickGuide({
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
      <Page>
        <Page.Header
          icon={RocketIcon}
          title="Get Started: Quick Guide for new members"
        />

        <Page.Vertical gap="lg" sizing="grow">
          <Page.Horizontal>
            <Page.Vertical>
              <Page.Vertical>
                <Page.H>
                  👋 Hello <br />{" "}
                  <span className="text-success-500">@mentions</span>
                </Page.H>
                <Page.P>
                  In Dust, you won't find just one AI assistant, but multiple
                  ones.
                </Page.P>
                <Page.P>
                  You can call any assistant at any time by typing “@” and the
                  name of the assistant.
                </Page.P>
              </Page.Vertical>
              <Page.Vertical>
                <Page.H>
                  👩‍🎨🦸‍♀️🥷🧑‍🚀
                  <br /> Why multiple
                  <br /> Assistants?
                </Page.H>

                <Page.P>
                  The basic assistant is{" "}
                  <span className="font-bold text-success-500">@gpt4</span>. It
                  is a raw model. “Raw” means it does not have particular
                  instructions or access to knowledge.
                </Page.P>
                <Page.P>
                  You also have access to assistants that use a raw model (gpt4
                  for instance), AND give them specific instructions and access
                  to knowledge.{" "}
                  <span className="font-bold">
                    They can answer specific questions, really well.
                  </span>
                </Page.P>
                <Page.P>
                  Assistants can be provided by Dust, by your company (Company
                  assistants), by your coworkers (Shared assistants).
                </Page.P>
              </Page.Vertical>
            </Page.Vertical>

            <Page.Vertical>
              <Page.Vertical>
                <Page.H>
                  👋 Hello <br />{" "}
                  <span className="text-success-500">@mentions</span>
                </Page.H>
                <Page.P>
                  In Dust, you won't find just one AI assistant, but multiple
                  ones.
                </Page.P>
                <Page.P>
                  You can call any assistant at any time by typing “@” and the
                  name of the assistant.
                </Page.P>
              </Page.Vertical>
              <Page.Vertical>
                <Page.H>
                  👩‍🎨🦸‍♀️🥷🧑‍🚀
                  <br /> Why multiple
                  <br /> Assistants?
                </Page.H>

                <Page.P>
                  The basic assistant is{" "}
                  <span className="font-bold text-success-500">@gpt4</span>. It
                  is a raw model. “Raw” means it does not have particular
                  instructions or access to knowledge.
                </Page.P>
                <Page.P>
                  You also have access to assistants that use a raw model (gpt4
                  for instance), AND give them specific instructions and access
                  to knowledge.{" "}
                  <span className="font-bold">
                    They can answer specific questions, really well.
                  </span>
                </Page.P>
                <Page.P>
                  Assistants can be provided by Dust, by your company (Company
                  assistants), by your coworkers (Shared assistants).
                </Page.P>
              </Page.Vertical>
            </Page.Vertical>
          </Page.Horizontal>
          <Page.Vertical>
            <Page.H>
              📚
              <br />
              What are
              <br />
              Data sources?
            </Page.H>

            <Page.P>
              To augment your assistants with knowledge, you give them data.
              Data can comes in different ways in Dust.{" "}
              <span className="font-bold">Here are the three main ways:</span>
            </Page.P>
            <Page.Horizontal>
              <Page.Vertical>
                <Page.H>Connections</Page.H>
                <Page.P>
                  Notion, Slack, Google Drive... Dust can connect to multiple
                  platforms and make syncronise your data.
                </Page.P>
              </Page.Vertical>
              <Page.Vertical>
                <Page.H>Folders</Page.H>
                <Page.P>Upload files (text, pdf, csv) directly in Dust.</Page.P>
              </Page.Vertical>
              <Page.Vertical>
                <Page.H>Websites</Page.H>
                <Page.P>
                  Any public website can be synced in Dust. Think FAQ, wikipedia
                  pages, documentation...
                </Page.P>
              </Page.Vertical>
            </Page.Horizontal>
          </Page.Vertical>
        </Page.Vertical>
      </Page>
    </Modal>
  );
}
