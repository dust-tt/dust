import { usePlatform } from "@app/shared/context/PlatformContext";
import type { StoredUser } from "@app/shared/services/auth";
import type { LightWorkspaceType } from "@dust-tt/client";
import { InteractiveImageGrid } from "@dust-tt/sparkle";
import { useEffect, useState } from "react";
import { visit } from "unist-util-visit";

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp"];

interface ImgProps {
  src: string;
  alt: string;
  owner: LightWorkspaceType;
  user: StoredUser;
}

export function Img({ src, alt, owner, user }: ImgProps) {
  const platform = usePlatform();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const matches = src ? src.match(/\bfil_[A-Za-z0-9]{10,}\b/g) : null;
  const fileId = matches && matches.length === 1 ? matches[0] : null;

  const isImageFile = alt
    ? IMAGE_EXTENSIONS.some((ext) => alt.toLowerCase().endsWith(ext))
    : false;

  const baseUrl = user.dustDomain;

  useEffect(() => {
    if (!fileId || !isImageFile || !baseUrl) {
      setIsLoading(false);
      return;
    }

    let objectUrl: string | null = null;

    const fetchImage = async () => {
      // TODO: Use SDK method once getFileContent is available.
      const token = await platform.auth.getAccessToken();
      const viewUrl = `${baseUrl}/api/v1/w/${owner.sId}/files/${fileId}?action=view&version=processed`;
      const response = await fetch(viewUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        setImageUrl(objectUrl);
      }
      setIsLoading(false);
    };

    void fetchImage();

    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [fileId, isImageFile, baseUrl, owner.sId, platform.auth]);

  if (!fileId || !isImageFile || !baseUrl) {
    return null;
  }

  return (
    <InteractiveImageGrid
      images={[
        {
          imageUrl: imageUrl ?? undefined,
          downloadUrl: imageUrl ?? undefined,
          alt: alt || "",
          title: alt || "",
          isLoading,
        },
      ]}
    />
  );
}

export function imgDirective() {
  return (tree: any) => {
    visit(tree, ["image"], (node) => {
      const data = node.data || (node.data = {});
      data.hName = "dustimg";
      data.hProperties = {
        src: node.url,
        alt: node.alt,
      };
    });
  };
}

export function getImgPlugin(owner: LightWorkspaceType, user: StoredUser) {
  const ImagePlugin = ({ src, alt }: { src: string; alt: string }) => {
    return <Img src={src} alt={alt} owner={owner} user={user} />;
  };

  return ImagePlugin;
}
