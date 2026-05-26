import { useJoinPod } from "@app/lib/swr/pods";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, EmptyCTA } from "@dust-tt/sparkle";
import { useState } from "react";

interface PodJoinCTAProps {
  owner: LightWorkspaceType;
  podId: string;
  podName: string;
  isRestricted: boolean;
  userName: string;
}

export function PodJoinCTA({
  owner,
  podId: podId,
  podName: podName,
  isRestricted,
  userName,
}: PodJoinCTAProps) {
  const [isJoining, setIsJoining] = useState(false);
  const doJoin = useJoinPod({ owner, podId, podName, userName });

  const handleJoin = async () => {
    setIsJoining(true);
    const success = await doJoin();
    if (!success) {
      setIsJoining(false);
    }
  };

  const message = isRestricted
    ? "You need to be invited to participate in this Pod."
    : "Join this Pod to participate in conversations.";

  const action = isRestricted ? null : (
    <Button
      label={isJoining ? "Joining..." : `Join the ${podName} Pod`}
      variant="highlight"
      onClick={handleJoin}
      disabled={isJoining}
    />
  );

  return <EmptyCTA message={message} action={action} />;
}
