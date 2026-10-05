// CAPSED Bureau: the office app (Facturation and Encaissement) in its own Windows window.
// The screens are the web build in ../dist-office; data stays on this computer and syncs with the cloud.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::time::Duration;
use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Manager, Runtime};

/// The main window is ready: show it (maximized, in front) and close the small opening card.
fn reveal<R: Runtime>(app: &AppHandle<R>) {
    if let Some(main) = app.get_webview_window("main") {
        if !main.is_visible().unwrap_or(false) {
            let _ = main.maximize();
            let _ = main.show();
            let _ = main.set_focus();
        }
    }
    if let Some(splash) = app.get_webview_window("splash") {
        let _ = splash.close();
    }
}

fn main() {
    tauri::Builder::default()
        // Opening the app a second time brings the open window to the front instead of a second copy.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            reveal(app);
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        // The small "Ouverture…" card shows the moment the app is clicked; the main window appears once its page is loaded.
        .on_page_load(|webview, payload| {
            if webview.label() == "main" && payload.event() == PageLoadEvent::Finished {
                reveal(webview.app_handle());
            }
        })
        .setup(|app| {
            // Safety net: open the main window anyway after a few seconds.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_secs(8));
                reveal(&handle);
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("CAPSED Bureau n'a pas pu démarrer");
}
