import React from "react";
import { useState, useEffect } from "react";
import { ChatView } from "../../components/ChatView";
import { ActivationView } from "../../components/ActivationView";
import { UpdateView } from "../../components/UpdateView";
import { VARS } from "variables";
import { getSecretAndUser } from "../../lib/user";

const Popup = () => {
  const [user, setUser] = useState(null);
  const [update, setUpdate] = useState(null);

  useEffect(() => {
    (async () => {
      let u = await getSecretAndUser();
      setUser(u);
    })();

    (async () => {
      const localVersion = chrome.runtime.getManifest().version;

      let verRes = await fetch(
        `${VARS.server}/api/xp1/version?version=${localVersion}`
      );
      let remoteVersion = await verRes.json();

      // console.log('LOCAL VERSION', localVersion);
      // console.log('REMOTE VERSION', remoteVersion);

      if (!remoteVersion.accepted_versions.includes(localVersion)) {
        setUpdate(remoteVersion);
      }
    })();
  }, []);

  return (
    <div>
      {update ? (
        <UpdateView update={update} />
      ) : user && user.status === "ready" ? (
        <ChatView user={user} />
      ) : (
        <ActivationView
          onActivate={() => {
            (async () => {
              let u = await getSecretAndUser();
              setUser(u);
            })();
          }}
        />
      )}
    </div>
  );
};

export default Popup;
