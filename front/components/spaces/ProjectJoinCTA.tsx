import { useJoinProject } from "@app/lib/swr/spaces";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, EmptyCTA } from "@dust-tt/sparkle";
import { useState } from "react";

interface ProjectJoinCTAProps {
  owner: LightWorkspaceType;
  spaceId: string;
  spaceName: string;
  isRestricted: boolean;
  userName: string;
}

export function ProjectJoinCTA({
  owner,
  spaceId,
  spaceName,
  isRestricted,
  userName,
}: ProjectJoinCTAProps) {
  const [isJoining, setIsJoining] = useState(false);
  const doJoin = useJoinProject({ owner, spaceId, spaceName, userName });

  const handleJoin = async () => {
    setIsJoining(true);
    const success = await doJoin();
    if (!success) {
      setIsJoining(false);
    }
  };

  const message = isRestricted
    ? "You need to be invited to participate in this project."
    : "Join this project to participate in conversations.";

  const action = isRestricted ? null : (
    <Button
      label={isJoining ? "Joining..." : `Join the ${spaceName} project`}
      variant="highlight"
      onClick={handleJoin}
      disabled={isJoining}
    />
  );

  return <EmptyCTA message={message} action={action} />;
}
