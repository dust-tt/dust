import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import React, { useState } from "react";

import { XCircle } from "@sparkle/icons/solid";
import { Citation, IconButton } from "@sparkle/index";

interface ZoomableImageCitationWrapperProps {
  alt: string;
  imgSrc: string;
  title: string;
  size: "xs" | "sm";
}

export function ZoomableImageCitationWrapper({
  alt,
  imgSrc,
  title,
  size = "sm",
}: ZoomableImageCitationWrapperProps) {
  const [isZoomed, setIsZoomed] = useState(false);

  const handleZoomToggle = () => {
    setIsZoomed(!isZoomed);
  };

  return (
    <>
      <div onClick={handleZoomToggle} className="s-min-h-76 s-group s-h-full">
        <Citation title={title} size={size} type="image" imgSrc={imgSrc} />
      </div>

      <Dialog
        transition
        open={isZoomed}
        onClose={handleZoomToggle}
        className="s-relative s-z-50 s-transition s-duration-300 s-ease-out data-[closed]:s-opacity-0"
      >
        <DialogBackdrop className="s-fixed s-inset-0 s-bg-black/70" />
        <div className="s-fixed s-inset-8 s-flex s-w-screen s-items-center s-justify-center s-p-4">
          <DialogPanel className="s-max-w-lg s-space-y-4">
            <DialogTitle>
              <div className="s-flex s-justify-end">
                <IconButton
                  icon={XCircle}
                  onClick={handleZoomToggle}
                  variant="white"
                />
              </div>
            </DialogTitle>
            <img src={imgSrc} alt={alt} />
          </DialogPanel>
        </div>
      </Dialog>
    </>
  );
}
