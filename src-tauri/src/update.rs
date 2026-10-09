// CAPSED Bureau tells when a new version exists; nothing is downloaded or installed unless the person asks.
// Every few hours it reads latest.json next to the installer on the GitHub release (a few bytes). The office app then
// shows « Nouvelle version disponible », which can be put off (« Plus tard »). « Installer » downloads the installer,
// checks its SHA-256, then starts it: the app closes, installs over itself and reopens. The data folder is not touched.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::Read;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager, Runtime};

const LATEST: &str = "https://github.com/atobouh/capsed-facture/releases/download/bureau-latest/latest.json";
const EVERY: Duration = Duration::from_secs(6 * 60 * 60);

#[derive(Deserialize)]
struct Latest {
    version: String,
    url: String,
    sha256: String,
    #[serde(default)]
    notes: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Available {
    version: String,
    notes: Option<String>,
    /// An installation of this same version was already started and the app is still on the old one.
    failed_before: bool,
    #[serde(skip)]
    url: String,
    #[serde(skip)]
    sha256: String,
}

#[derive(Default)]
pub struct Updates {
    available: Mutex<Option<Available>>,
    busy: AtomicBool,
    cancel: AtomicBool,
    done: AtomicU64,
    total: AtomicU64,
}

fn parts(v: &str) -> Vec<u64> {
    v.trim().trim_start_matches('v').split('.').map(|p| p.parse().unwrap_or(0)).collect()
}
fn newer(candidate: &str, current: &str) -> bool {
    parts(candidate) > parts(current)
}

fn agent() -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(20))
        .timeout_read(Duration::from_secs(120))
        .build()
}

fn updates_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("mises-a-jour"))
}

/// One check: only latest.json is read. A newer version is offered; nothing is downloaded.
fn check<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let current = app.package_info().version.to_string();
    let latest: Latest = agent().get(LATEST).call().map_err(|e| e.to_string())?.into_json().map_err(|e| e.to_string())?;
    let state = app.state::<Updates>();
    if !newer(&latest.version, &current) {
        // Up to date: installers kept from earlier updates are no longer needed.
        let _ = std::fs::remove_dir_all(updates_dir(app)?);
        *state.available.lock().unwrap() = None;
        return Ok(());
    }
    let failed_before = std::fs::read_to_string(updates_dir(app)?.join("tentative.txt")).map(|v| v.trim() == latest.version).unwrap_or(false);
    *state.available.lock().unwrap() = Some(Available { version: latest.version, notes: latest.notes, failed_before, url: latest.url, sha256: latest.sha256.to_lowercase() });
    Ok(())
}

fn sha256_of(path: &PathBuf) -> std::io::Result<String> {
    Ok(format!("{:x}", Sha256::digest(std::fs::read(path)?)))
}

/// Checks a few seconds after start, then every 6 hours. Without internet it simply tries again later.
pub fn start<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(10));
        loop {
            let _ = check(&app);
            std::thread::sleep(EVERY);
        }
    });
}

/// Downloads the installer (progress readable with update_progress, stoppable with cancel_update) and checks it.
/// An installer already downloaded and intact is reused.
fn download<R: Runtime>(app: &AppHandle<R>, a: &Available) -> Result<PathBuf, String> {
    let state = app.state::<Updates>();
    let dir = updates_dir(app)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("CAPSED-Bureau-{}.exe", a.version));
    if path.exists() && sha256_of(&path).map(|h| h == a.sha256).unwrap_or(false) {
        return Ok(path);
    }
    let response = agent().get(&a.url).call().map_err(|_| "Pas de connexion au serveur des mises à jour. Réessayez plus tard.".to_string())?;
    state.total.store(response.header("Content-Length").and_then(|v| v.parse().ok()).unwrap_or(0), Ordering::SeqCst);
    let mut reader = response.into_reader().take(200 * 1024 * 1024);
    let (mut body, mut chunk) = (Vec::new(), vec![0u8; 64 * 1024]);
    loop {
        if state.cancel.load(Ordering::SeqCst) {
            return Err("annulé".into());
        }
        let n = reader.read(&mut chunk).map_err(|_| "La connexion a été coupée pendant le téléchargement. Réessayez plus tard.".to_string())?;
        if n == 0 {
            break;
        }
        body.extend_from_slice(&chunk[..n]);
        state.done.store(body.len() as u64, Ordering::SeqCst);
    }
    if format!("{:x}", Sha256::digest(&body)) != a.sha256 {
        return Err("Le fichier reçu est incomplet ou modifié. Réessayez plus tard.".into());
    }
    std::fs::write(&path, &body).map_err(|e| e.to_string())?;
    Ok(path)
}

/// Starts the installer itself (no command prompt in between: a path in quotes is passed exactly as it is).
/// It closes this app if it is still open, installs over it and keeps the data folder.
/// The version tried is written down, so a failed attempt is reported the next time.
fn launch(path: &PathBuf, args: &[&str]) -> bool {
    if let Some(dir) = path.parent() {
        let version = path.file_stem().and_then(|s| s.to_str()).unwrap_or("").trim_start_matches("CAPSED-Bureau-").to_string();
        let _ = std::fs::write(dir.join("tentative.txt"), version);
    }
    std::process::Command::new(path).args(args).spawn().is_ok()
}

#[tauri::command]
pub fn update_ready(state: tauri::State<'_, Updates>) -> Option<Available> {
    state.available.lock().unwrap().clone()
}

/// [bytes received, bytes expected (0 if unknown)] during « Installer ».
#[tauri::command]
pub fn update_progress(state: tauri::State<'_, Updates>) -> [u64; 2] {
    [state.done.load(Ordering::SeqCst), state.total.load(Ordering::SeqCst)]
}

#[tauri::command]
pub fn cancel_update(state: tauri::State<'_, Updates>) {
    state.cancel.store(true, Ordering::SeqCst);
}

/// « Installer »: download, check, then the installer's small progress window; CAPSED Bureau reopens by itself.
/// Returns an error in plain French when it could not go through (the app keeps working on its current version).
#[tauri::command]
pub async fn install_update<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let state = app.state::<Updates>();
    let Some(a) = state.available.lock().unwrap().clone() else {
        return Err("Aucune nouvelle version à installer.".into());
    };
    if state.busy.swap(true, Ordering::SeqCst) {
        return Err("La mise à jour est déjà en cours.".into());
    }
    state.cancel.store(false, Ordering::SeqCst);
    state.done.store(0, Ordering::SeqCst);
    state.total.store(0, Ordering::SeqCst);
    let handle = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let path = download(&handle, &a)?;
        if handle.state::<Updates>().cancel.load(Ordering::SeqCst) {
            return Err("annulé".into());
        }
        if launch(&path, &["/P", "/UPDATE", "/R"]) { Ok(()) } else { Err("L’installateur n’a pas pu être ouvert.".into()) }
    })
    .await
    .map_err(|e| e.to_string())
    .and_then(|r| r);
    state.busy.store(false, Ordering::SeqCst);
    if result.is_ok() {
        app.exit(0);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::newer;
    #[test]
    fn versions() {
        assert!(newer("1.0.12", "1.0.9"));
        assert!(!newer("1.0.9", "1.0.9"));
        assert!(!newer("1.0.8", "1.0.10"));
        assert!(newer("v1.1.0", "1.0.99"));
    }
}
