import { Dialog } from "@headlessui/react";
import React, { useState } from "react";

import { Citation } from "@sparkle/components/Citation";
import { IconButton } from "@sparkle/components/IconButton";
import { XCircleIcon } from "@sparkle/icons/solid";

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
      <div onClick={handleZoomToggle} className="s-min-h-76 s-group s-flex">
        <Citation
          title={title}
          size={size}
          type="image"
          imgSrc={imgSrc}
          sizing="fluid"
        />
      </div>

      <Dialog
        open={isZoomed}
        onClose={handleZoomToggle}
        className="s-relative s-z-50"
      >
        <div className="s-fixed s-inset-0 s-flex s-w-screen s-items-center s-justify-center s-bg-black/70 s-p-4 s-transition-opacity">
          <Dialog.Panel className="s-max-w-lg s-space-y-4">
            <Dialog.Title>
              <div className="s-flex s-justify-end">
                <IconButton
                  icon={XCircleIcon}
                  onClick={handleZoomToggle}
                  variant="ghost"
                />
              </div>
            </Dialog.Title>
            <img src={imgSrc} alt={alt} />
          </Dialog.Panel>
        </div>
      </Dialog>
    </>
  );
}
