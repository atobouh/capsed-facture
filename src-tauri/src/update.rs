// CAPSED Bureau keeps itself up to date.
// In the background it reads latest.json next to the installer on the GitHub release, downloads a newer installer,
// and checks its SHA-256 before keeping it. The office app then says « Mise à jour prête »: it installs when the app
// is closed (silently), or at once with « Installer maintenant » (small progress bar, then the app reopens).
// Nothing is lost: the app's data folder is not touched by the installer.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::Read;
use std::path::PathBuf;
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
pub struct Ready {
    version: String,
    notes: Option<String>,
    /// An installation of this same version was already started and the app is still on the old one.
    failed_before: bool,
    #[serde(skip)]
    path: PathBuf,
}

#[derive(Default)]
pub struct Updates {
    ready: Mutex<Option<Ready>>,
    launched: Mutex<bool>,
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

/// One check: a newer version is downloaded and verified, then marked ready.
fn updates_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("mises-a-jour"))
}

fn check<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let current = app.package_info().version.to_string();
    let latest: Latest = agent().get(LATEST).call().map_err(|e| e.to_string())?.into_json().map_err(|e| e.to_string())?;
    if !newer(&latest.version, &current) {
        // Up to date: the installers kept for earlier updates are no longer needed.
        let _ = std::fs::remove_dir_all(updates_dir(app)?);
        return Ok(());
    }
    let state = app.state::<Updates>();
    if state.ready.lock().unwrap().as_ref().map(|r| r.version == latest.version).unwrap_or(false) {
        return Ok(());
    }
    let dir = updates_dir(app)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("CAPSED-Bureau-{}.exe", latest.version));
    if !(path.exists() && sha256_of(&path).map(|h| h == latest.sha256.to_lowercase()).unwrap_or(false)) {
        let mut body = Vec::new();
        agent().get(&latest.url).call().map_err(|e| e.to_string())?.into_reader().take(200 * 1024 * 1024).read_to_end(&mut body).map_err(|e| e.to_string())?;
        let hash = format!("{:x}", Sha256::digest(&body));
        if hash != latest.sha256.to_lowercase() {
            return Err("téléchargement incomplet ou modifié, nouvel essai plus tard".into());
        }
        std::fs::write(&path, &body).map_err(|e| e.to_string())?;
    }
    let failed_before = std::fs::read_to_string(dir.join("tentative.txt")).map(|v| v.trim() == latest.version).unwrap_or(false);
    *state.ready.lock().unwrap() = Some(Ready { version: latest.version, notes: latest.notes, failed_before, path });
    Ok(())
}

fn sha256_of(path: &PathBuf) -> std::io::Result<String> {
    Ok(format!("{:x}", Sha256::digest(std::fs::read(path)?)))
}

/// Checks a little after start, then every 6 hours. Without internet it simply tries again later.
pub fn start<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(30));
        loop {
            let _ = check(&app);
            std::thread::sleep(EVERY);
        }
    });
}

/// Starts the installer itself (no command prompt in between: a path in quotes is passed exactly as it is).
/// It closes this app if it is still open, installs over it and keeps the data folder.
/// The version tried is written down, so a failed attempt is reported instead of being offered again silently.
fn launch(path: &PathBuf, args: &[&str]) -> bool {
    if let Some(dir) = path.parent() {
        let version = path.file_stem().and_then(|s| s.to_str()).unwrap_or("").trim_start_matches("CAPSED-Bureau-").to_string();
        let _ = std::fs::write(dir.join("tentative.txt"), version);
    }
    std::process::Command::new(path).args(args).spawn().is_ok()
}

/// When the app closes with an update ready, it installs silently; the next opening is the new version.
pub fn on_exit<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<Updates>();
    let ready = state.ready.lock().unwrap().clone();
    let mut launched = state.launched.lock().unwrap();
    if let (false, Some(r)) = (*launched, ready) {
        *launched = launch(&r.path, &["/S", "/UPDATE"]);
    }
}

#[tauri::command]
pub fn update_ready(state: tauri::State<'_, Updates>) -> Option<Ready> {
    state.ready.lock().unwrap().clone()
}

/// « Installer maintenant »: small progress bar, then CAPSED Bureau reopens by itself.
#[tauri::command]
pub fn install_update_now<R: Runtime>(app: AppHandle<R>, state: tauri::State<'_, Updates>) -> bool {
    let ready = state.ready.lock().unwrap().clone();
    let Some(r) = ready else { return false };
    let ok = launch(&r.path, &["/P", "/UPDATE", "/R"]);
    if ok {
        *state.launched.lock().unwrap() = true;
        app.exit(0);
    }
    ok
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
