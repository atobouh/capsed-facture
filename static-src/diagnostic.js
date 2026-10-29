(function () {
  var panel = document.getElementById('capsed-error');
  var details = document.getElementById('capsed-error-detail');
  var failed = false;
  function show(message) {
    if (failed) return;
    failed = true;
    details.textContent = String(message || 'Erreur inconnue').slice(0, 400) + '\nVersion des fichiers : ' + panel.getAttribute('data-build') + '\nDate : ' + new Date().toISOString() + '\nMoteur : ' + navigator.userAgent;
    panel.hidden = false;
  }
  window.addEventListener('capsed-fatal', function (e) { show('Erreur de démarrage : ' + e.detail); });
  window.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t.tagName === 'SCRIPT' && /(?:^|\/)app\.js(?:\?|$)/.test(t.getAttribute('src') || '')) show('Impossible de charger les fichiers de CAPSED Bureau.');
    else if (e.message) show('Erreur JavaScript : ' + e.message);
  }, true);
  window.addEventListener('unhandledrejection', function (e) { show('Erreur : ' + (e.reason && e.reason.message || 'opération impossible')); });
  window.setTimeout(function () {
    if (document.querySelector('#root .cx-boot')) show('CAPSED Bureau ne parvient pas à démarrer. Redémarrez puis communiquez ce message à l’assistance.');
  }, 20000);
}());
