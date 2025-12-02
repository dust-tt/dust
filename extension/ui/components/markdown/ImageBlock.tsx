import { useDustAPI } from "@app/shared/lib/dust_api";
import { InteractiveImageGrid } from "@dust-tt/sparkle";
import { useEffect, useState } from "react";
import { visit } from "unist-util-visit";

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp"];

interface ImgProps {
  src: string;
  alt: string;
}

export function Img({ src, alt }: ImgProps) {
  const dustAPI = useDustAPI();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const matches = src ? src.match(/\bfil_[A-Za-z0-9]{10,}\b/g) : null;
  const fileId = matches && matches.length === 1 ? matches[0] : null;

  const isImageFile = alt
    ? IMAGE_EXTENSIONS.some((ext) => alt.toLowerCase().endsWith(ext))
    : false;

  useEffect(() => {
    if (!fileId || !isImageFile) {
      setIsLoading(false);
      return;
    }

    let objectUrl: string | null = null;

    const fetchImage = async () => {
      const result = await dustAPI.getFileContent({
        fileId,
        version: "processed",
      });

      if (result.isOk()) {
        objectUrl = URL.createObjectURL(result.value);
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
  }, [fileId, isImageFile, dustAPI]);

  if (!fileId || !isImageFile) {
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

export function getImgPlugin() {
  const ImagePlugin = ({ src, alt }: { src: string; alt: string }) => {
    return <Img src={src} alt={alt} />;
  };

  return ImagePlugin;
}
