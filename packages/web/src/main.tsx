/**
 * Null — Web entry point
 *
 * Installs the browser-native nullBridge (IndexedDB storage, Web APIs), then
 * renders the same React app used by the Electron desktop build. Both clients
 * connect to the same signaling server and are fully interoperable.
 *
 * The bridge is installed synchronously before any React components mount, so
 * window.nullBridge is available to all useEffect hooks that reference it.
 */

import { installWebBridge } from "./web-bridge.js";

// Install before any React code runs — components call window.nullBridge
// only inside effects and event handlers, never at module parse time.
installWebBridge();

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppProvider } from "@app/context/AppContext.js";
import { App } from "@app/App.js";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root element not found");

createRoot(rootEl).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>
);
