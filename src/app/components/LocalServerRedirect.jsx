import { useEffect } from "react";
import { subscribeConnection } from "../network/connection-manager";
import { readOfflineSettings } from "../pwa/offline-settings";

function shouldRedirectToLocal(localOrigin) {
  if (!localOrigin || localOrigin === window.location.origin) return false;
  if (!/^https?:\/\//.test(localOrigin)) return false;
  return window.location.protocol === "https:" || window.location.hostname.endsWith("vercel.app");
}

export default function LocalServerRedirect() {
  useEffect(() => {
    return subscribeConnection(connection => {
      if (connection.checking || connection.mode !== "offline") return;
      const localOrigin = readOfflineSettings().localServerOrigin;
      if (!shouldRedirectToLocal(localOrigin)) return;
      window.location.replace(`${localOrigin}${window.location.pathname}${window.location.search}${window.location.hash}`);
    });
  }, []);

  return null;
}
