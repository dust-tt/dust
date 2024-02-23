import "react-image-crop/dist/ReactCrop.css";

import {
  ArrowUpOnSquareIcon,
  Avatar,
  Button,
  ImageIcon,
  Modal,
  Tab,
} from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import type { ChangeEvent } from "react";
import { useMemo, useRef, useState } from "react";
import React from "react";
import type { Crop } from "react-image-crop";
import ReactCrop, { centerCrop, makeAspectCrop } from "react-image-crop";

import { classNames } from "@app/lib/utils";

const DEFAULT_CROP: Crop = {
  unit: "%",
  width: 50,
  height: 50,
  x: 25,
  y: 25,
};

export function AvatarPicker({
  owner,
  isOpen,
  setOpen,
  onPick,
  droidAvatarUrls,
  spiritAvatarUrls,
}: {
  owner: WorkspaceType;
  isOpen: boolean;
  setOpen: (isOpen: boolean) => void;
  onPick: (avatar: string) => void;
  droidAvatarUrls: string[];
  spiritAvatarUrls: string[];
}) {
  type TabId = "droids" | "spirits" | "upload";
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [currentTab, setCurrentTab] = useState<TabId>("droids");
  const [crop, setCrop] = useState<Crop>(DEFAULT_CROP);
  const [src, setSrc] = useState<string | null>(null);

  const avatarUrls: Record<TabId, string[]> = {
    droids: droidAvatarUrls,
    spirits: spiritAvatarUrls,
    upload: [],
  };
  const tabs: {
    label: string;
    id: TabId;
    current: boolean;
    icon: React.ComponentType<{
      className?: string;
    }>;
  }[] = useMemo(
    () => [
      {
        label: "Droids",
        id: "droids",
        current: currentTab === "droids",
        icon: ImageIcon,
      },
      {
        label: "Spirits",
        id: "spirits",
        current: currentTab === "spirits",
        icon: ImageIcon,
      },
      {
        label: "Upload",
        id: "upload",
        current: currentTab === "upload",
        icon: ArrowUpOnSquareIcon,
      },
    ],
    [currentTab]
  );

  const onClose = () => {
    setOpen(false);

    // wait for modal close animation to finish before resetting state
    setTimeout(() => {
      setCrop(DEFAULT_CROP);
      setCurrentTab("droids");
      setSrc(null);
    }, 300);
  };

  const imageRef = React.useRef<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onUpload = async () => {
    if (isUploadingAvatar) return;

    if (imageRef.current && crop.width && crop.height) {
      const croppedImageUrl = await getCroppedImg(imageRef.current, crop);

      const formData = new FormData();
      const response = await fetch(croppedImageUrl);
      const blob = await response.blob();
      const f = new File([blob], "avatar.jpeg", { type: "image/jpeg" });
      formData.append("file", f);
      setIsUploadingAvatar(true);
      try {
        const res = await fetch(
          `/api/w/${owner.sId}/assistant/agent_configurations/avatar`,
          {
            method: "POST",
            body: formData,
          }
        );
        if (!res.ok) {
          console.error("Error uploading avatar");
          alert("Error uploading avatar");
        }
        const { fileUrl } = await res.json();
        onPick(fileUrl);
      } catch (e) {
        console.error("Error uploading avatar");
        alert("Error uploading avatar");
      } finally {
        setIsUploadingAvatar(false);
      }
    }

    onClose();
  };

  const getCroppedImg = (
    image: HTMLImageElement,
    crop: Crop
  ): Promise<string> => {
    const canvas = document.createElement("canvas");

    canvas.width = crop.width ? (crop.width / 100) * image.naturalWidth : 0;
    canvas.height = crop.height ? (crop.height / 100) * image.naturalHeight : 0;

    const ctx = canvas.getContext("2d");

    if (ctx) {
      ctx.drawImage(
        image,
        crop.x ? (crop.x / 100) * image.naturalWidth : 0,
        crop.y ? (crop.y / 100) * image.naturalHeight : 0,
        canvas.width,
        canvas.height,
        0,
        0,
        canvas.width,
        canvas.height
      );
    }

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Canvas is empty"));
          return;
        }
        blob = new File([blob], "avatar.jpeg", { type: "image/jpeg" });
        const fileUrl = window.URL.createObjectURL(blob);
        resolve(fileUrl);
      }, "image/jpeg");
    });
  };

  const onFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e?.target?.files?.[0];
    if (!file) return;
    setCurrentTab("upload");
    const reader = new FileReader();
    reader.addEventListener("load", () => setSrc(reader.result as string));
    reader.readAsDataURL(file);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title=""
      variant="side-md"
      hasChanged={currentTab === "upload" && !!src}
      onSave={isUploadingAvatar ? undefined : onUpload}
    >
      <input
        type="file"
        style={{ display: "none" }}
        onChange={onFileChange}
        ref={fileInputRef}
      />

      <div className="h-full w-full overflow-visible">
        <div className="overflow-x-auto pt-3">
          <Tab tabs={tabs} setCurrentTab={setCurrentTab} />
        </div>
        <div className="h-full w-full overflow-y-auto">
          {["droids", "spirits"].includes(currentTab) ? (
            <div className="mb-16 mt-3 grid w-full grid-cols-8 gap-2 overflow-y-auto">
              {avatarUrls[currentTab].map((url) => (
                <div
                  key={url}
                  className="cursor-pointer"
                  onClick={() => {
                    onPick(url);
                    onClose();
                  }}
                >
                  <Avatar size="auto" visual={<img src={url} />} />
                </div>
              ))}
            </div>
          ) : (
            <div
              className={classNames(
                "my-3 flex items-center justify-center rounded-xl",
                !src ? "min-h-64 bg-slate-50" : ""
              )}
            >
              {src ? (
                <div>
                  <ReactCrop
                    crop={crop}
                    aspect={1}
                    onChange={(_, pC) => setCrop(pC)}
                  >
                    <img
                      src={src}
                      alt="Profile"
                      onLoad={(event) => {
                        const { naturalWidth: width, naturalHeight: height } =
                          event.currentTarget;

                        const newCrop = centerCrop(
                          makeAspectCrop(
                            {
                              unit: "%",
                              width: 100,
                            },
                            1,
                            width,
                            height
                          ),
                          width,
                          height
                        );

                        setCrop(newCrop);
                      }}
                      ref={imageRef}
                    />
                  </ReactCrop>
                </div>
              ) : (
                <Button
                  label="Upload"
                  icon={ArrowUpOnSquareIcon}
                  onClick={() => fileInputRef?.current?.click()}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
