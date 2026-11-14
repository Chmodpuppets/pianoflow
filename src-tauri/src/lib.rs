//! PianoFlow desktop shell.
//!
//! The entire practice experience lives in the web frontend (`apps/web`); this
//! crate embeds it in a native WebView window so the app runs offline as a
//! first-class desktop application (no browser chrome, native window controls).

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
