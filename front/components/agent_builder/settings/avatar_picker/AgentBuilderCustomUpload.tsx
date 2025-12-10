import { ArrowUpOnSquareIcon, Button } from "@dust-tt/sparkle";
import type { ChangeEvent } from "react";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import type { Crop } from "react-image-crop";
import { centerCrop, makeAspectCrop, ReactCrop } from "react-image-crop";

import type { AvatarPickerTabElement } from "@app/components/agent_builder/settings/avatar_picker/types";
import { useFileUploaderService } from "@app/hooks/useFileUploaderService";
import { clientFetch } from "@app/lib/egress/client";
import { classNames } from "@app/lib/utils";
import type { WorkspaceType } from "@app/types";

const DEFAULT_CROP: Crop = {
  unit: "%",
  width: 50,
  height: 50,
  x: 25,
  y: 25,
};

interface AgentBuilderCustomUploadProps {
  onChange: () => void;
  owner: WorkspaceType;
}

const AgentBuilderCustomUpload = forwardRef<
  AvatarPickerTabElement,
  AgentBuilderCustomUploadProps
>(function CustomUploadAvatar(
  { onChange, owner }: AgentBuilderCustomUploadProps,
  ref
) {
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [crop, setCrop] = useState<Crop>(DEFAULT_CROP);
  const [src, setSrc] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const fileUploaderService = useFileUploaderService({
    owner,
    useCase: "avatar",
  });

  useImperativeHandle(ref, () => {
    return {
      getUrl: async () => {
        if (isUploadingAvatar) {
          return null;
        }

        if (imageRef.current && crop.width && crop.height) {
          // eslint-disable-next-line react-hooks/immutability
          const croppedImageUrl = await getCroppedImg(imageRef.current, crop);
          const response = await clientFetch(croppedImageUrl);

          const blob = await response.blob();
          const f = new File([blob], "avatar.jpeg", { type: "image/jpeg" });

          setIsUploadingAvatar(true);
          const files = await fileUploaderService.handleFilesUpload([f]);
          setIsUploadingAvatar(false);

          fileUploaderService.resetUpload();

          if (files && files.length > 0) {
            const f = files[0];
            if (f.publicUrl) {
              return f.publicUrl;
            }
          }
        }
        return null;
      },
    };
  }, [crop, imageRef, isUploadingAvatar, fileUploaderService]);

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
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      setSrc(reader.result as string);
      onChange();
    });
    reader.readAsDataURL(file);
  };

  return (
    <>
      <input
        type="file"
        style={{ display: "none" }}
        onChange={onFileChange}
        ref={fileInputRef}
        accept=".png,.jpg,.jpeg"
      />

      <div
        className={classNames(
          "my-3 flex items-center justify-center rounded-xl",
          !src
            ? "min-h-64 bg-muted-background dark:bg-muted-background-night"
            : ""
        )}
      >
        {src ? (
          <div>
            <ReactCrop crop={crop} aspect={1} onChange={(_, pC) => setCrop(pC)}>
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
    </>
  );
});

export default AgentBuilderCustomUpload;
