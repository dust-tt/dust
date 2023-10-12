import "react-image-crop/dist/ReactCrop.css";

import {
  ArrowUpOnSquareIcon,
  Avatar,
  Button,
  ImageIcon,
  Modal,
  Tab,
} from "@dust-tt/sparkle";
import { ChangeEvent, useRef, useState } from "react";
import React from "react";
import ReactCrop, { centerCrop, Crop, makeAspectCrop } from "react-image-crop";

import { classNames } from "@app/lib/utils";
import { WorkspaceType } from "@app/types/user";

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
  avatarUrls,
}: {
  owner: WorkspaceType;
  isOpen: boolean;
  setOpen: (isOpen: boolean) => void;
  onPick: (avatar: string) => void;
  avatarUrls: { available: boolean; url: string }[];
}) {
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [currentTab, setCurrentTab] = useState<"pick" | "upload">("pick");
  const [crop, setCrop] = useState<Crop>(DEFAULT_CROP);
  const [src, setSrc] = useState<string | null>(null);

  const onClose = () => {
    setOpen(false);

    // wait for modal close animation to finish before resetting state
    setTimeout(() => {
      setCrop(DEFAULT_CROP);
      setCurrentTab("pick");
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
      title="Select an avatar for your assistant:"
      type="full-screen"
      hasChanged={currentTab === "upload" && !!src}
      onSave={isUploadingAvatar ? undefined : onUpload}
    >
      <input
        type="file"
        style={{ display: "none" }}
        onChange={onFileChange}
        ref={fileInputRef}
      />
      <div className="mx-auto max-w-4xl px-8 pt-6">
        <div className="overflow-x-auto">
          <Tab
            tabs={[
              {
                label: "Gallery",
                current: currentTab === "pick",
                icon: ImageIcon,
              },
              {
                label: "Upload",
                current: currentTab === "upload",
                icon: ArrowUpOnSquareIcon,
              },
            ]}
            onTabClick={(tab) => {
              const isUploadTab = tab.startsWith("Upload");
              if (isUploadTab) {
                setCurrentTab("upload");
              } else {
                setCurrentTab("pick");
              }
            }}
          />
        </div>
        {currentTab === "pick" && (
          <div className="grid grid-cols-4 gap-4 pt-8 lg:grid-cols-8">
            {avatarUrls.map(({ available, url }) => (
              <div
                key={url}
                className={classNames(
                  available ? "cursor-pointer" : "opacity-30"
                )}
                onClick={() => {
                  if (available) {
                    onPick(url);
                    onClose();
                  }
                }}
              >
                <Avatar
                  size="auto"
                  visual={<img src={url} />}
                  clickable={available}
                />
              </div>
            ))}
          </div>
        )}
        <div
          className={classNames(
            "mt-8 flex items-center justify-center",
            currentTab !== "upload" ? "hidden" : "",
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
      </div>
    </Modal>
  );
}
