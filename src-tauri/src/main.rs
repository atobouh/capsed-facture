// CAPSED Bureau: the office app (Facturation and Encaissement) in its own Windows window.
// The screens are the web build in ../dist-office; data stays on this computer and syncs with the cloud.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::time::Duration;
use tauri::webview::PageLoadEvent;
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        // Opening the app a second time brings the open window to the front instead of a second copy.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        // The window starts hidden and appears once the first screen is drawn: no black or white flash.
        .on_page_load(|webview, payload| {
            if payload.event() == PageLoadEvent::Finished {
                let _ = webview.window().show();
            }
        })
        .setup(|app| {
            // Safety net: show the window anyway after a few seconds.
            if let Some(w) = app.get_webview_window("main") {
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_secs(4));
                    let _ = w.show();
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("CAPSED Bureau n'a pas pu démarrer");
}
