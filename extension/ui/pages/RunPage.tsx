import { useCreateConversationWithMessage } from "@app/hooks/useCreateConversationWithMessage";
import { Spinner } from "@dust-tt/sparkle";
import { usePlatform } from "@extension/shared/context/PlatformContext";
import { useExtensionAuth } from "@extension/ui/components/auth/AuthProvider";
import { useFileUploaderService } from "@extension/ui/hooks/useFileUploaderService";
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export const RunPage = () => {
  const platform = usePlatform();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, workspace } = useExtensionAuth();

  const fileUploaderService = useFileUploaderService(platform.capture, null);

  const createConversationWithMessage = useCreateConversationWithMessage({
    owner: workspace!,
    user,
  });

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
      });

      const conversationRes = await createConversationWithMessage({
        messageData: {
          input: params.text,
          mentions: [{ configurationId: params.configurationId }],
          contentFragments: {
            uploaded: files
              ? files.map((cf) => ({
                  title: cf.filename,
                  fileId: cf.fileId || "",
                  url: cf.publicUrl,
                  contentType: cf.contentType,
                }))
              : [],
            contentNodes: [],
          },
          origin: "extension",
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
    <div className="flex h-full w-full items-center justify-center">
      <Spinner size="xl" />
    </div>
  );
};
