"use client";

import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // When a new service worker takes control (e.g. after a deploy), reload
    // once so the page runs the freshly-deployed assets instead of a version
    // cached by an older worker. The guard prevents an infinite reload loop.
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          // Actively check for a newer worker on every load so updates roll
          // out without the user having to clear the cache manually.
          registration.update().catch(() => {});
          registration.addEventListener("updatefound", () => {
            const installing = registration.installing;
            if (!installing) return;
            installing.addEventListener("statechange", () => {
              // A new worker has installed while an old one is controlling the
              // page — tell it to activate immediately (it also calls
              // skipWaiting itself, this is a belt-and-braces nudge).
              if (
                installing.state === "installed" &&
                navigator.serviceWorker.controller
              ) {
                registration.waiting?.postMessage("SKIP_WAITING");
              }
            });
          });
        })
        .catch(() => {
          // SW registration failed — silently ignored, app works normally.
        });
    };

    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
