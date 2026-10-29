// capsed-facture.pages.dev: Pages serves the site files (Direction site, office app at /bureau/);
// the API and the recovery link go to the CAPSED Worker, which keeps the data. Same Worker as capsed.<account>.workers.dev.
export default {
  fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/api/") || path.startsWith("/secours/")) return env.APP.fetch(request);
    return env.ASSETS.fetch(request);
  },
};
