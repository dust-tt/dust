import {
  FolderIcon,
  GlobeAltIcon,
  Icon,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@dust-tt/sparkle";
import { CloudArrowLeftRightIcon } from "@dust-tt/sparkle";
import Image from "next/image";

import { useURLSheet } from "@app/hooks/useURLSheet";

export function QuickStartGuide() {
  const { isOpen, onOpenChange } = useURLSheet("quickGuide");

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent size="xl">
        <SheetHeader>
          <SheetTitle>🚀 Getting started with Dust</SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <div className="grid grid-cols-6 gap-x-6 gap-y-8 text-sm text-foreground">
            <div className="relative col-span-6 aspect-video">
              <iframe
                src="https://fast.wistia.net/embed/iframe/v90n8beuh9?seo=true&videoFoam=false"
                title="Dust product tour"
                allow="autoplay; fullscreen"
                className="absolute left-0 top-0 h-full w-full"
              />
            </div>
            <div className="col-span-3 flex flex-col gap-2">
              <h5 className="text-xl font-semibold">
                👋 Hello <span className="text-success-500">@assistants</span>
              </h5>
              <p>
                In Dust, you have access to{" "}
                <strong>multiple AI&nbsp;assistants</strong>.
              </p>
              <p>
                You can call an assistant by typing <strong>"@"</strong> and the
                name of the assistant. You can even call several assistants at
                the same time or chain them in one conversation.
              </p>
            </div>
            <Image
              src="/static/quick_start_guide_input_bar.png"
              className="col-span-3"
              width={400}
              height={100}
              alt="Input bar"
            />
            <div className="col-span-3 flex flex-col gap-4">
              <h5 className="text-xl font-semibold">
                👩‍🎨🦸‍♀️🥷🧑‍🚀 Multiple Assistants
              </h5>
              <p className="font-medium">
                Specialized assistants can help answer questions, really well.
              </p>
              <p>
                Assistants in Dust can be provided by Dust, by your company
                (Company assistants) or by your coworkers (Shared assistants).
              </p>
              <p>
                Specialized assistants generally combine a model with specific
                instructions and access to knowledge.
              </p>
              <p>
                Raw model assistants, without any particular instructions or
                access to your company knowledge are also available, like{" "}
                <span className="font-medium text-success-500">@gpt4</span>.
              </p>
            </div>
            <div className="col-span-3 flex flex-col gap-4">
              <h5 className="text-xl font-semibold">
                🛠️ Build your own Assistants
              </h5>
              <p className="font-medium">
                Assistants start with an "instruction": a text telling what you
                want them to do.
              </p>
              <p>
                For instance,{" "}
                <span className="italic">"Act as a&nbsp;doctor"</span>,{" "}
                <span className="italic">"Summarize this document"</span>,{" "}
                <span className="italic">"What do you know about&nbsp;X"</span>.
              </p>
              <p>
                And you can give them access to knowledge.
                <br />
                We call them <span className="font-medium">Data sources.</span>
              </p>
              <p>
                With the right Data source, assistants can answer questions like{" "}
                <span className="italic">
                  "Have we been working with company X"
                </span>
                , <span className="italic">"How do we manage expenses"</span>,{" "}
                <span className="italic">
                  "Write an intro email using the company tone of voice"...
                </span>
              </p>
            </div>

            <div className="col-span-6 flex flex-col gap-4">
              <h5 className="text-xl font-semibold">
                📚 What are Data sources?
              </h5>
              <p>
                To augment your assistants with knowledge, you give them data in
                three ways:
              </p>
            </div>
            <div className="col-span-2 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Icon visual={CloudArrowLeftRightIcon} className="text-brand" />
                <h6 className="font-semibold">Connections</h6>
              </div>
              <p>
                Notion, Slack, Google Drive... Dust can connect to multiple
                platforms and synchronize your data.
              </p>
            </div>
            <div className="col-span-2 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Icon visual={FolderIcon} className="text-brand" />
                <h6 className="font-semibold">Folders</h6>
              </div>
              <p>Upload files (text, pdf, csv) directly in Dust.</p>
            </div>
            <div className="col-span-2 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Icon visual={GlobeAltIcon} className="text-brand" />
                <h6 className="font-semibold">Websites</h6>
              </div>
              <p>
                Any public website can be synced in Dust. Think FAQ, wikipedia
                pages, documentation...
              </p>
            </div>
          </div>
        </SheetContainer>
      </SheetContent>
    </Sheet>
  );
}
