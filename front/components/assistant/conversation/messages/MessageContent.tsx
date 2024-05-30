import {
  Avatar,
  Citation,
  Icon,
  IconButton,
  MagnifyingGlassIcon,
  XMarkIcon,
  XMarkStrokeIcon,
} from "@dust-tt/sparkle";
import type { ContentFragmentType } from "@dust-tt/types";
import { chromemanagement } from "googleapis/build/src/apis/chromemanagement";
import { useState } from "react";

import { ContentFragment } from "@app/components/assistant/conversation/ContentFragment";
import type { MessageSizeType } from "@app/components/assistant/conversation/ConversationMessage";
import { ButtonEmoji } from "@app/components/assistant/conversation/messages/MessageActions";
import { classNames } from "@app/lib/utils";

interface MessageContentProps {
  children: React.ReactNode;
  citations?: ContentFragmentType[];
  size: MessageSizeType;
}

// const ScreenshotButton = () => {
//   const [screenshotSrc, setScreenshotSrc] = useState("");

//   const takeScreenshot = async () => {
//     try {
//       const displayMediaOptions = {
//         video: {
//           displaySurface: "browser",
//         },
//         preferCurrentTab: false,
//         selfBrowserSurface: "exclude",
//         systemAudio: "include",
//         surfaceSwitching: "include",
//         monitorTypeSurfaces: "include",
//       };

//       const stream = await navigator.mediaDevices.getDisplayMedia(
//         displayMediaOptions
//       );
//       const video = document.createElement("video");
//       video.srcObject = stream;

//       video.onloadedmetadata = async () => {
//         console.log(">> onloadedmetadata <<");
//         await video.play();
//         // Create a canvas to capture the screenshot
//         const canvas = document.createElement("canvas");
//         canvas.width = video.videoWidth;
//         canvas.height = video.videoHeight;
//         const context = canvas.getContext("2d");
//         context?.drawImage(video, 0, 0, canvas.width, canvas.height);

//         // Get the screenshot URL
//         const screenshotUrl = canvas.toDataURL("image/png");
//         console.log(screenshotUrl); // Example: log the screenshot URL

//         setScreenshotSrc(screenshotUrl);

//         // Stop the stream
//         stream.getTracks().forEach((track) => track.stop());
//       };
//     } catch (error) {
//       console.error("Error taking screenshot:", error);
//     }
//   };

//   console.log(">> screenshotSrc:", screenshotSrc);
//   return (
//     <div>
//       {screenshotSrc ? <img src={screenshotSrc} /> : <></>}
//       <button onClick={takeScreenshot}>Take Screenshot</button>
//     </div>
//   );
// };

export const ZoomImage = ({
  src,
  alt,
  title,
  onClose,
}: {
  src: string;
  title: string;
  alt: string;
  onClose?: () => void;
}) => {
  const [isZoomed, setIsZoomed] = useState(false);

  const handleZoom = () => {
    setIsZoomed(!isZoomed);
  };

  console.log(">> isZoomed:", isZoomed);

  return (
    <div className="relative">
      <div onClick={handleZoom} className="min-h-76 group h-full">
        {/* <Avatar visual={src} size="xxl" /> */}
        {/* <Icon
          visual={MagnifyingGlassIcon}
          size="xl"
          className="absolute hidden group-hover:block"
        /> */}
        {/* <img src={src} /> */}
        <Citation
          title={title}
          size="xs"
          type="image"
          // href={src || undefined}
          imgSrc={src}
          onClose={onClose}
        />
      </div>
      {isZoomed && (
        <div
          className="fixed inset-0 z-50 flex max-w-[100%] items-center justify-center bg-black bg-opacity-75"
          onClick={handleZoom}
        >
          <div className="relative flex h-3/4 w-3/4 flex-col items-center gap-4">
            <div className="cursor-pointer self-end text-white">
              <IconButton icon={XMarkIcon} onClick={handleZoom} />
            </div>
            <img src={src} alt={alt} />
          </div>
        </div>
      )}
    </div>
  );
};

export function MessageContent({
  children,
  citations,
  size,
}: MessageContentProps) {
  const citationNodes = citations?.map((c, id) => {
    console.log(">> c.sourceUrl:", c.textBytes);
    if (c.contentType === "image_attachment" && c.sourceUrl) {
      return <ZoomImage src={c.sourceUrl} alt="image" key={id} />;
      // return (
      //   <Citation
      //     title={c.title}
      //     size="xs"
      //     type="document"
      //     href={c.sourceUrl || undefined}
      //     avatarUrl={c.sourceUrl}
      //     key={id}
      //   />
      // );
    } else {
      return <ContentFragment message={c} key={c.id} />;
    }
  });

  return (
    <div
      className={classNames(
        "flex flex-col justify-stretch",
        size === "compact" ? "gap-3" : "gap-4"
      )}
    >
      <div
        className={classNames(
          "px-3 font-normal text-element-900",
          size === "compact" ? "text-sm" : "text-base"
        )}
      >
        {children}
      </div>
      {/* <ScreenshotButton /> */}
      {citationNodes && (
        <div
          className={classNames(
            "grid gap-2",
            size === "compact" ? "grid-cols-2" : "grid-cols-4"
          )}
        >
          {citationNodes}
        </div>
      )}
    </div>
  );
}
