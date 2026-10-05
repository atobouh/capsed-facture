// CAPSED Bureau: the office app (Facturation and Encaissement) in its own Windows window.
// The screens are the web build in ../dist-office; data stays on this computer and syncs with the cloud.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("CAPSED Bureau n'a pas pu démarrer");
}
