import React from "react";
import { useState } from "react";
import { checkAPI } from "../../lib/connect";
import { ActivationView } from "../../components/ActivationView";
import { IndexView } from "../../components/IndexView";
const Popup = () => {
  const [connected, setConnected] = useState(false);

  checkAPI().then((res) => {
    if (res && !connected) {
      setConnected(true);
    }
  });

  return (
    <div className="dust">
      {connected ? (
        <IndexView />
      ) : (
        <ActivationView
          onActivate={async () =>
            checkAPI().then(() => {
              setConnected(true);
            })
          }
        />
      )}
    </div>
  );
};

export default Popup;
