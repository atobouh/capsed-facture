import React from "react";
import { createRoot } from "react-dom/client";
import { CloudSiteApp, OfficeApp } from "../app/v2/cloud-app";

declare const __CAPSED_MODE__: string;
// The Direction website (served by the cloud Worker) or the office desktop app. The build mode is a constant,
// so each build keeps only its own screens: a smaller file that starts faster.
createRoot(document.getElementById("root")!).render(<React.StrictMode>{__CAPSED_MODE__ === "site" ? <CloudSiteApp /> : <OfficeApp />}</React.StrictMode>);

// The site and the office app keep their own files on the device, so they open even without network.
// Not inside the desktop app: its files are already on the computer.
if ("serviceWorker" in navigator && !("__TAURI_INTERNALS__" in window)) window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => { /* sans cache hors ligne */ }); });
