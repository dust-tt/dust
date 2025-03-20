import { usePlatform } from "@app/shared/context/PlatformContext";
import { postConversation } from "@app/shared/lib/conversation";
import { useDustAPI } from "@app/shared/lib/dust_api";
import { useFileUploaderService } from "@app/ui/hooks/useFileUploaderService";
import { Spinner } from "@dust-tt/sparkle";
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";

export const RunPage = () => {
  const platform = usePlatform();
  const navigate = useNavigate();
  const location = useLocation();
  const dustAPI = useDustAPI();

  const fileUploaderService = useFileUploaderService();

  useEffect(() => {
    const run = async () => {
      const params = JSON.parse(decodeURI(location.search.substr(1)));

      if (params.conversationId) {
        await navigate(`/conversations/${params.conversationId}`);
        return;
      }

      const files = await fileUploaderService.uploadContentTab({
        includeContent: params.includeContent,
        includeCapture: params.includeCapture,
        includeSelectionOnly: params.includeSelectionOnly,
        updateBlobs: false,
      });

      const conversationRes = await postConversation(platform, {
        dustAPI,
        messageData: {
          input: params.text,
          mentions: [{ configurationId: params.configurationId }],
          contentFragments: {
            uploaded: files
              ? files.map((cf) => ({
                  title: cf.filename,
                  fileId: cf.fileId || "",
                  url: cf.publicUrl,
                  kind: cf.kind,
                }))
              : [],
            contentNodes: [],
          },
        },
      });

      fileUploaderService.resetUpload();

      if (conversationRes.isOk()) {
        navigate(`/conversations/${conversationRes.value.sId}`);
      } else {
        navigate("/");
      }
    };

    void run();
  }, []);
  return (
    <div className="w-full h-full flex items-center justify-center">
      <Spinner size="xl" />
    </div>
  );
};
