import React from "react";
import { createRoot } from "react-dom/client";
import Home from "../app/page";
import App from "../app/v2/app";

// The role-based redesign is the default; the first prototype stays reachable at #ancien for comparison.
const root = createRoot(document.getElementById("root")!);
function render() {
  const legacy = location.hash === "#ancien";
  document.body.classList.toggle("legacy-prototype", legacy);
  // The first prototype brings its own page-wide stylesheet; the new app never loads it.
  let link = document.getElementById("legacy-css") as HTMLLinkElement | null;
  if (legacy && !link) { link = document.createElement("link"); link.id = "legacy-css"; link.rel = "stylesheet"; link.href = "legacy.css"; document.head.appendChild(link); }
  if (link) link.disabled = !legacy;
  root.render(<React.StrictMode>{legacy ? <Home /> : <App />}</React.StrictMode>);
}
let wasLegacy = location.hash === "#ancien";
window.addEventListener("hashchange", () => { const legacy = location.hash === "#ancien"; if (legacy !== wasLegacy) { wasLegacy = legacy; render(); } });
render();
