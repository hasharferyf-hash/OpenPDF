use std::{path::{Path, PathBuf}, sync::Mutex};

use tauri::{Emitter, Manager, State};

use tauri::ipc::{InvokeBody, Request, Response};

mod atomic_file;

#[derive(Default)]
struct PendingOpenFiles(Mutex<Vec<String>>);

/// OpenPDF only ever reads and writes PDF files; every path coming from the
/// webview is checked against this before touching the file system.
fn is_pdf_path(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("pdf"))
}

/// Decodes a percent-encoded UTF-8 string (HTTP header values must be ASCII).
fn percent_decode(input: &str) -> Result<String, String> {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = bytes
                .get(i + 1..i + 3)
                .and_then(|pair| std::str::from_utf8(pair).ok())
                .and_then(|pair| u8::from_str_radix(pair, 16).ok())
                .ok_or_else(|| "Invalid path encoding".to_string())?;
            out.push(hex);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).map_err(|_| "Invalid path encoding".to_string())
}


/// Resolves PDF paths from either launch. The first argument is the
/// executable path; subsequent relative paths are resolved against that launch's cwd.
fn collect_pdf_paths<I, S>(args: I, cwd: &Path) -> Vec<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<Path>,
{
    args.into_iter()
        .skip(1)
        .filter_map(|arg| {
            let path = arg.as_ref();
            let path = if path.is_absolute() { path.to_path_buf() } else { cwd.join(path) };
            is_pdf_path(&path).then(|| path.to_string_lossy().into_owned())
        })
        .collect()
}

/// Drains file-open requests received before the frontend event listener was ready.
#[tauri::command]
fn take_pending_open_files(state: State<'_, PendingOpenFiles>) -> Vec<String> {
    std::mem::take(&mut *state.0.lock().unwrap())
}

/// Returns the raw bytes of a local PDF file.
#[tauri::command]
async fn read_pdf(path: String) -> Result<Response, String> {
    let path = PathBuf::from(path);
    if !is_pdf_path(&path) {
        return Err("Only PDF files can be opened".into());
    }
    let data = std::fs::read(&path).map_err(|error| error.to_string())?;
    Ok(Response::new(data))
}

/// Writes the request body to the PDF path given in the `x-path` header.
/// The path always comes from the native "Save as" dialog.
#[tauri::command]
fn write_pdf(request: Request<'_>) -> Result<(), String> {
    let InvokeBody::Raw(data) = request.body() else {
        return Err("The PDF data must be sent as a binary body".into());
    };
    let encoded = request
        .headers()
        .get("x-path")
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| "Missing target path".to_string())?;
    let path = PathBuf::from(percent_decode(encoded)?);
    if !path.is_absolute() || !is_pdf_path(&path) {
        return Err("Only PDF files can be saved".into());
    }
    atomic_file::write_atomically(&path, data).map_err(|error| error.to_string())
}

/// All PDFs passed on the command line, including missing files so the UI can
/// report individual read failures while opening the remaining documents.
#[tauri::command]
fn startup_files() -> Vec<String> {
    let cwd = std::env::current_dir().unwrap_or_default();
    collect_pdf_paths(std::env::args_os(), &cwd)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default().manage(PendingOpenFiles::default());

    // Keep this first among plugins: it must intercept later launches before
    // other plugins initialize. The plugin is desktop-only.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
        let paths = collect_pdf_paths(&args, Path::new(&cwd));
        if !paths.is_empty() {
            app.state::<PendingOpenFiles>().0.lock().unwrap().extend(paths);
            let _ = app.emit("open-pdf-files", ());
        }
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }));

    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![read_pdf, write_pdf, startup_files, take_pending_open_files])
        .run(tauri::generate_context!())
        .expect("error while running OpenPDF");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_percent_encoded_paths() {
        assert_eq!(percent_decode("C%3A%5Cdocs%5Ca%20b.pdf").unwrap(), r"C:\docs\a b.pdf");
        assert_eq!(percent_decode("%D7%A9%D7%9C%D7%95%D7%9D.pdf").unwrap(), "שלום.pdf");
        assert!(percent_decode("bad%2").is_err());
        assert!(percent_decode("bad%zz").is_err());
    }

    #[test]
    fn collects_only_pdf_arguments_and_resolves_relative_paths() {
        let cwd = std::env::temp_dir().join("OpenPDF routing tests");
        let absolute = cwd.join("שלום two.PDF");
        let args = vec![
            "OpenPDF.exe".to_string(),
            "one.pdf".to_string(),
            absolute.to_string_lossy().into_owned(),
            "notes.txt".to_string(),
            "missing.pdf".to_string(),
        ];
        let expected = vec![cwd.join("one.pdf"), absolute, cwd.join("missing.pdf")];
        let expected: Vec<String> = expected.iter().map(|path| path.to_string_lossy().into_owned()).collect();
        // Warm launches supply strings; cold launches supply OS strings.
        assert_eq!(collect_pdf_paths(&args, &cwd), expected);
        assert_eq!(collect_pdf_paths(args.iter().map(std::ffi::OsString::from), &cwd), expected);
    }

    #[test]
    fn excludes_executable_even_if_its_name_ends_in_pdf() {
        let cwd = std::env::temp_dir();
        assert!(collect_pdf_paths(["OpenPDF.pdf"], &cwd).is_empty());
        assert!(collect_pdf_paths(["OpenPDF.exe", "notes.txt"], &cwd).is_empty());
    }

    #[test]
    fn accepts_only_pdf_paths() {
        assert!(is_pdf_path(Path::new(r"C:\docs\File.PDF")));
        assert!(!is_pdf_path(Path::new(r"C:\docs\file.exe")));
        assert!(!is_pdf_path(Path::new(r"C:\docs\pdf")));
    }
}
