import React from "react";
import { createRoot } from "react-dom/client";
import { CloudSiteApp, OfficeApp } from "../app/v2/cloud-app";
import { MODE } from "../app/v2/store";

// The Direction website (served by the cloud Worker) or the office desktop app.
createRoot(document.getElementById("root")!).render(<React.StrictMode>{MODE === "site" ? <CloudSiteApp /> : <OfficeApp />}</React.StrictMode>);

// The site and the office app keep their own files on the device, so they open even without network.
if ("serviceWorker" in navigator) window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => { /* sans cache hors ligne */ }); });
