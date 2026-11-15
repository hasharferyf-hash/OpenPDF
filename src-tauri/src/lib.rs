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

/// Marker file shipped in the portable ZIP. When it sits next to the executable,
/// browser data (language/theme settings, cache) is kept in a folder beside it
/// instead of the user's profile.
const PORTABLE_MARKER: &str = "OpenPDF.portable";
const PORTABLE_DATA_DIR: &str = "OpenPDF-data";
#[cfg(windows)]
const WEBVIEW2_DOWNLOAD_URL: &str = "https://developer.microsoft.com/microsoft-edge/webview2/";

/// Finds a WebView2 "Fixed Version" runtime placed next to the executable, either in a
/// folder named `WebView2` or in the folder extracted from Microsoft's .cab file.
fn bundled_webview2(exe_dir: &Path) -> Option<PathBuf> {
    let has_runtime = |dir: &Path| dir.join("msedgewebview2.exe").is_file();
    let preferred = exe_dir.join("WebView2");
    if has_runtime(&preferred) {
        return Some(preferred);
    }
    std::fs::read_dir(exe_dir)
        .ok()?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .find(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with("Microsoft.WebView2.FixedVersionRuntime"))
                && has_runtime(path)
        })
}

/// Configures WebView2 through its documented environment variables, which take
/// precedence over the values the app passes when creating the webview.
fn configure_webview2() {
    let Some(exe_dir) = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(Path::to_path_buf))
    else {
        return;
    };
    if let Some(runtime) = bundled_webview2(&exe_dir) {
        std::env::set_var("WEBVIEW2_BROWSER_EXECUTABLE_FOLDER", runtime);
    }
    if exe_dir.join(PORTABLE_MARKER).is_file() {
        std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", exe_dir.join(PORTABLE_DATA_DIR));
    }
}

/// Without WebView2 the window cannot be created; explain that instead of failing silently.
#[cfg(windows)]
fn report_missing_webview2() {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        MessageBoxW, IDYES, MB_ICONWARNING, MB_SETFOREGROUND, MB_YESNO,
    };
    let wide = |text: &str| text.encode_utf16().chain(Some(0)).collect::<Vec<u16>>();
    let title = wide("OpenPDF");
    let message = wide(
        "OpenPDF needs the Microsoft Edge WebView2 Runtime, which is not installed on this computer.\n\
         Open the download page now?\n\n\
         OpenPDF זקוקה לרכיב Microsoft Edge WebView2 Runtime, שאינו מותקן במחשב זה.\n\
         לפתוח עכשיו את דף ההורדה?",
    );
    // SAFETY: both strings are NUL-terminated UTF-16 buffers that outlive the call.
    let answer = unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            message.as_ptr(),
            title.as_ptr(),
            MB_YESNO | MB_ICONWARNING | MB_SETFOREGROUND,
        )
    };
    if answer == IDYES {
        let _ = std::process::Command::new("explorer").arg(WEBVIEW2_DOWNLOAD_URL).spawn();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    configure_webview2();
    #[cfg(windows)]
    if tauri::webview_version().is_err() {
        report_missing_webview2();
        return;
    }

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
    fn finds_a_fixed_webview2_runtime_next_to_the_executable() {
        let root = std::env::temp_dir().join(format!("openpdf-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        assert_eq!(bundled_webview2(&root), None);

        let extracted = root.join("Microsoft.WebView2.FixedVersionRuntime.130.0.2849.80.x64");
        std::fs::create_dir_all(&extracted).unwrap();
        assert_eq!(bundled_webview2(&root), None, "a folder without the runtime is ignored");
        std::fs::write(extracted.join("msedgewebview2.exe"), b"").unwrap();
        assert_eq!(bundled_webview2(&root), Some(extracted));

        let preferred = root.join("WebView2");
        std::fs::create_dir_all(&preferred).unwrap();
        std::fs::write(preferred.join("msedgewebview2.exe"), b"").unwrap();
        assert_eq!(bundled_webview2(&root), Some(preferred));
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn accepts_only_pdf_paths() {
        assert!(is_pdf_path(Path::new(r"C:\docs\File.PDF")));
        assert!(!is_pdf_path(Path::new(r"C:\docs\file.exe")));
        assert!(!is_pdf_path(Path::new(r"C:\docs\pdf")));
    }
}
