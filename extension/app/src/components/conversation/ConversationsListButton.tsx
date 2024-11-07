import { Button, HistoryIcon } from "@dust-tt/sparkle";
import { useNavigate } from "react-router-dom";

export const ConversationsListButton = ({
  size = "sm",
}: {
  size?: "sm" | "md";
}) => {
  const navigate = useNavigate();
  return (
    <Button
      tooltip="View all conversations"
      icon={HistoryIcon}
      variant="ghost"
      onClick={() => navigate("/conversations")}
      size={size}
    />
  );
};
