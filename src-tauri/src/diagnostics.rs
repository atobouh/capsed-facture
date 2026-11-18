//! Native watchdog: diagnostics remain available even when the renderer cannot paint.
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
static LAST_ALIVE: AtomicU64 = AtomicU64::new(0);
fn now() -> u64 { SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs() }
#[cfg(target_os = "windows")]
fn dialog(message: &str, retry: bool) -> bool {
    #[link(name = "user32")]
    extern "system" { fn MessageBoxW(window: *mut std::ffi::c_void, text: *const u16, title: *const u16, flags: u32) -> i32; }
    let text: Vec<u16> = message.encode_utf16().chain(Some(0)).collect();
    let title: Vec<u16> = "CAPSED Bureau — diagnostic".encode_utf16().chain(Some(0)).collect();
    // MB_ICONERROR | MB_SETFOREGROUND | MB_RETRYCANCEL (or MB_OK).
    unsafe { MessageBoxW(std::ptr::null_mut(), text.as_ptr(), title.as_ptr(), 0x10 | 0x10000 | if retry { 5 } else { 0 }) == 4 }
}
#[cfg(not(target_os = "windows"))]
fn dialog(message: &str, _retry: bool) -> bool { eprintln!("{message}"); false }
pub fn startup_failure(reason: &str) {
    dialog(&format!("NATIVE_START : CAPSED Bureau n’a pas pu démarrer. Vérifiez Microsoft Edge WebView2 et les autorisations du poste, puis réessayez. Si le problème persiste, contactez l’assistance. Ne supprimez pas vos données.\nDétail : {}", reason), false);
}
#[tauri::command]
pub fn interface_alive() { LAST_ALIVE.store(now(), Ordering::SeqCst); }
pub fn watch(app: AppHandle) {
    interface_alive();
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(10));
        if now().saturating_sub(LAST_ALIVE.load(Ordering::SeqCst)) < 90 { continue; }
        if let Ok(dir) = app.path().app_local_data_dir() {
            let _ = std::fs::create_dir_all(&dir);
            // No credentials, invoice content or profile dump in this log.
            use std::io::Write;
            if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(dir.join("diagnostic.log")) {
                let _ = writeln!(file, "{} version={} WEBVIEW_NO_RESPONSE", now(), app.package_info().version);
            }
        }
        let retry = dialog("WEBVIEW_NO_RESPONSE : l’interface de CAPSED Bureau ne répond plus depuis au moins 90 secondes. Cela peut provenir de WebView2, d’un blocage du code ou d’une surcharge du poste. Réessayer relance CAPSED ; une saisie non enregistrée peut être perdue. Annuler laisse l’application ouverte. Si cela se reproduit, vérifiez WebView2, l’espace disque et transmettez le code à l’assistance. Ne supprimez pas les données.", true);
        if retry { app.restart(); }
        interface_alive();
    });
}
