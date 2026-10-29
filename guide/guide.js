// Opened from inside CAPSED (help panel): show « Retour à l'application », which closes the manual.
(function () {
  var inApp = window.parent !== window || /[?&]app=1/.test(location.search);
  if (!inApp) return;
  document.documentElement.classList.add("in-app");
  document.querySelectorAll(".back-app").forEach(function (b) { b.addEventListener("click", function (e) { e.preventDefault(); try { window.parent.postMessage("capsed-guide-close", "*"); } catch (x) { /* rien */ } if (window.parent === window) history.back(); }); });
  // Links between manual pages keep the in-app mode.
  if (window.parent === window) document.querySelectorAll("a[href$='.html'], a[href*='.html#']").forEach(function (a) { a.href = a.getAttribute("href").replace(/\.html/, ".html?app=1"); });
})();
