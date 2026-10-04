import React from "react";
import { createRoot } from "react-dom/client";
import Home from "../app/page";
import App from "../app/v2/app";

// The role-based redesign is the default; the first prototype stays reachable at #ancien for comparison.
const root = createRoot(document.getElementById("root")!);
function render() {
  const legacy = location.hash === "#ancien";
  document.body.classList.toggle("legacy-prototype", legacy);
  root.render(<React.StrictMode>{legacy ? <Home /> : <App />}</React.StrictMode>);
}
let wasLegacy = location.hash === "#ancien";
window.addEventListener("hashchange", () => { const legacy = location.hash === "#ancien"; if (legacy !== wasLegacy) { wasLegacy = legacy; render(); } });
render();
