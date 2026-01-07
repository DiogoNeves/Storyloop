import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";

import "./index.css";
import App from "./App.tsx";

// Register service worker for PWA offline support with update handling
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    // With autoUpdate + skipWaiting, this rarely fires, but handle it gracefully
    console.log("[SW] New version available, updating...");
    void updateSW(true);
  },
  onOfflineReady() {
    console.log("[SW] App ready for offline use");
  },
  onRegistered(registration: ServiceWorkerRegistration | undefined) {
    console.log("[SW] Service worker registered");
    // Check for updates periodically (every hour)
    if (registration) {
      setInterval(
        () => {
          void registration.update();
        },
        60 * 60 * 1000,
      );
    }
  },
  onRegisterError(error) {
    console.error("[SW] Registration failed:", error);
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
