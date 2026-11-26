use std::{
    ffi::{c_char, c_void},
    mem::{size_of, zeroed},
    os::windows::ffi::OsStrExt,
    path::Path,
    ptr::{null, null_mut},
    sync::{
        atomic::{AtomicBool, AtomicU32, Ordering::Relaxed},
        mpsc, Arc, Mutex,
    },
    time::Duration,
};

use tauri::{
    async_runtime::{channel, spawn_blocking, Sender},
    ipc::{InvokeBody, Request},
    Manager, State, WebviewWindow,
};
use windows_sys::Win32::{
    Foundation::{FreeLibrary, GlobalFree, HMODULE, HWND},
    Graphics::Gdi::{DeleteDC, GetDeviceCaps, HDC, HORZRES, LOGPIXELSX, LOGPIXELSY, VERTRES},
    Storage::Xps::{AbortDoc, EndDoc, EndPage, StartDocW, StartPage, DOCINFOW},
    System::{
        LibraryLoader::{
            GetProcAddress, LoadLibraryExW, LOAD_LIBRARY_SEARCH_DEFAULT_DIRS,
            LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR,
        },
        Ole::{OleInitialize, OleUninitialize},
    },
    UI::Controls::Dialogs::{
        PrintDlgExW, PD_CURRENTPAGE, PD_NOSELECTION, PD_PAGENUMS, PD_PRINTTOFILE, PD_RESULT_PRINT,
        PD_RETURNDC, PD_USEDEVMODECOPIESANDCOLLATE, PRINTDLGEXW, PRINTPAGERANGE, START_PAGE_GENERAL,
    },
};

type PrintResult = Result<(), String>;
struct Submission {
    bytes: Vec<u8>,
    result: Sender<PrintResult>,
}

struct ActiveJob {
    id: u32,
    input: Option<mpsc::Sender<Submission>>,
    cancelled: Arc<AtomicBool>,
}

#[derive(Default)]
pub struct NativePrintState {
    next_id: AtomicU32,
    active: Arc<Mutex<Option<ActiveJob>>>,
}

struct JobLease(Arc<Mutex<Option<ActiveJob>>>);
impl Drop for JobLease {
    fn drop(&mut self) {
        self.0.lock().unwrap().take();
    }
}

/// Returns a job ID only if the user accepted the dialog. The printer DC stays
/// on the same STA worker until the WebView submits the PDF or cancels the job.
#[tauri::command]
pub async fn choose_native_print(
    window: WebviewWindow,
    state: State<'_, NativePrintState>,
    page_count: u32,
    current_page: u32,
    title: String,
) -> Result<Option<u32>, String> {
    if page_count == 0 || page_count > i32::MAX as u32
        || current_page == 0 || current_page > page_count
        || title.len() > 1024 || title.contains('\0')
    {
        return Err("Invalid print document metadata".into());
    }
    let owner = window.hwnd().map_err(|e| e.to_string())?.0 as usize;
    let runtime = window.path().resource_dir().map_err(|e| e.to_string())?
        .join("pdfium-runtime").join("bin").join("pdfium.dll");
    let (send_pdf, receive_pdf) = mpsc::channel::<Submission>();
    let (dialog_result, mut selection) = channel(1);
    let id = state.next_id.fetch_add(1, Relaxed);
    let cancelled = Arc::new(AtomicBool::new(false));
    {
        let mut active = state.active.lock().unwrap();
        if active.is_some() {
            return Err("A print job is already active".into());
        }
        *active = Some(ActiveJob { id, input: Some(send_pdf), cancelled: Arc::clone(&cancelled) });
    }
    let lease = JobLease(Arc::clone(&state.active));
    spawn_blocking(move || {
        // Keep the owner alive, and initialize COM on the thread showing the dialog.
        let _owner_window = window;
        let printer = Apartment::enter().and_then(|com| {
            choose_printer(owner as HWND, page_count, current_page)
                .map(|printer| printer.map(|printer| (com, printer)))
        });
        match printer {
            Ok(Some((_com, printer))) => {
                if dialog_result.blocking_send(Ok(Some(id))).is_err() {
                    return;
                }
                // A vanished WebView must not hold the device context indefinitely.
                if let Ok(job) = receive_pdf.recv_timeout(Duration::from_secs(300)) {
                    let result = printer.print(&runtime, &title, &job.bytes, &cancelled);
                    drop(printer);
                    drop(lease);
                    let _ = job.result.blocking_send(result);
                }
            }
            Ok(None) => {
                drop(lease);
                let _ = dialog_result.blocking_send(Ok(None));
            }
            Err(error) => {
                drop(lease);
                let _ = dialog_result.blocking_send(Err(error));
            }
        }
    });
    selection.recv().await.ok_or_else(|| "Print dialog closed unexpectedly".to_string())?
}

#[tauri::command]
pub async fn submit_native_print(request: Request<'_>, state: State<'_, NativePrintState>) -> PrintResult {
    let id = request.headers().get("x-print-job")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u32>().ok())
        .ok_or("Missing print job ID")?;
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected binary PDF data".into());
    };
    let (result, mut completed) = channel(1);
    let sender = state.active.lock().unwrap().as_mut()
        .filter(|job| job.id == id)
        .and_then(|job| job.input.take())
        .ok_or("Print job has expired or was cancelled")?;
    sender.send(Submission { bytes: bytes.clone(), result })
        .map_err(|_| "Print job has expired or was cancelled".to_string())?;
    completed.recv().await.ok_or_else(|| "Native printing stopped unexpectedly".to_string())?
}

#[tauri::command]
pub fn cancel_native_print(id: u32, state: State<'_, NativePrintState>) {
    if let Some(job) = state.active.lock().unwrap().as_mut().filter(|job| job.id == id) {
        job.cancelled.store(true, Relaxed);
        job.input.take();
    }
}

struct Apartment;
impl Apartment {
    fn enter() -> Result<Self, String> {
        let result = unsafe { OleInitialize(null()) };
        if result < 0 {
            return Err(format!("Cannot initialize Windows print dialog (HRESULT 0x{result:08x})"));
        }
        Ok(Self)
    }
}
impl Drop for Apartment {
    fn drop(&mut self) {
        unsafe { OleUninitialize() };
    }
}

#[derive(Debug, PartialEq, Eq)]
struct PageRange { first: u32, last: u32 }

fn page_ranges(flags: u32, count: u32, current: u32, ranges: &[PRINTPAGERANGE]) -> Result<Vec<PageRange>, String> {
    if flags & PD_CURRENTPAGE != 0 {
        return Ok(vec![PageRange { first: current, last: current }]);
    }
    if flags & PD_PAGENUMS == 0 {
        return Ok(vec![PageRange { first: 1, last: count }]);
    }
    if ranges.is_empty() || ranges.iter().any(|r| r.nFromPage == 0 || r.nFromPage > r.nToPage || r.nToPage > count) {
        return Err("Windows returned an invalid print range".into());
    }
    let mut selected: Vec<_> = ranges.iter().map(|r| PageRange {
        first: r.nFromPage,
        last: r.nToPage,
    }).collect();
    selected.sort_unstable_by_key(|range| range.first);
    let mut merged: Vec<PageRange> = Vec::with_capacity(selected.len());
    for range in selected {
        if let Some(last) = merged.last_mut().filter(|last| range.first <= last.last.saturating_add(1)) {
            last.last = last.last.max(range.last);
        } else {
            merged.push(range);
        }
    }
    Ok(merged)
}

struct PrinterContext(HDC);
impl Drop for PrinterContext {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe { DeleteDC(self.0) };
        }
    }
}

struct Printer {
    dc: PrinterContext,
    pages: Vec<PageRange>,
    source_pages: u32,
    to_file: bool,
}

fn choose_printer(owner: HWND, count: u32, current: u32) -> Result<Option<Printer>, String> {
    // SAFETY: the dialog and range buffer live through the call. Windows fills
    // the printer handles, which we release even if the user cancels.
    let mut entries = [PRINTPAGERANGE { nFromPage: 0, nToPage: 0 }; 64];
    let mut dialog: PRINTDLGEXW = unsafe { zeroed() };
    dialog.lStructSize = size_of::<PRINTDLGEXW>() as u32;
    dialog.hwndOwner = owner;
    dialog.Flags = PD_RETURNDC | PD_NOSELECTION | PD_USEDEVMODECOPIESANDCOLLATE;
    dialog.nMaxPageRanges = entries.len() as u32;
    dialog.lpPageRanges = entries.as_mut_ptr();
    dialog.nMinPage = 1;
    dialog.nMaxPage = count;
    dialog.nCopies = 1;
    dialog.nStartPage = START_PAGE_GENERAL;
    let status = unsafe { PrintDlgExW(&mut dialog) };
    let dc = PrinterContext(dialog.hDC);
    unsafe {
        if !dialog.hDevMode.is_null() { GlobalFree(dialog.hDevMode); }
        if !dialog.hDevNames.is_null() { GlobalFree(dialog.hDevNames); }
    }
    if status < 0 {
        return Err(format!("Windows print dialog failed (HRESULT 0x{status:08x})"));
    }
    if dialog.dwResultAction != PD_RESULT_PRINT {
        return Ok(None);
    }
    if dc.0.is_null() {
        return Err("Windows did not return a printer device context".into());
    }
    let selected = entries.get(..dialog.nPageRanges as usize).ok_or("Too many print ranges")?;
    Ok(Some(Printer {
        dc,
        pages: page_ranges(dialog.Flags, count, current, selected)?,
        source_pages: count,
        to_file: dialog.Flags & PD_PRINTTOFILE != 0,
    }))
}

struct SpoolJob(HDC, bool);
impl Drop for SpoolJob {
    fn drop(&mut self) {
        if !self.1 {
            unsafe { AbortDoc(self.0) };
        }
    }
}

impl Printer {
    fn print(&self, runtime: &Path, title: &str, bytes: &[u8], cancelled: &AtomicBool) -> PrintResult {
        if cancelled.load(Relaxed) {
            return Ok(());
        }
        let api = Pdfium::load(runtime)?;
        let pdf = api.open(bytes)?;
        if unsafe { (api.page_count)(pdf.handle) } != self.source_pages as i32 {
            return Err("Print snapshot has a different page count".into());
        }
        let dc = self.dc.0;
        let device = unsafe {
            [HORZRES, VERTRES, LOGPIXELSX, LOGPIXELSY].map(|index| GetDeviceCaps(dc, index as i32))
        };
        let title: Vec<u16> = title.encode_utf16().chain(Some(0)).collect();
        let file_port = [70u16, 73, 76, 69, 58, 0]; // FILE:
        let info = DOCINFOW {
            cbSize: size_of::<DOCINFOW>() as i32,
            lpszDocName: title.as_ptr(),
            lpszOutput: if self.to_file { file_port.as_ptr() } else { null() },
            lpszDatatype: null(),
            fwType: 0,
        };
        if cancelled.load(Relaxed) {
            return Ok(());
        }
        if unsafe { StartDocW(dc, &info) } <= 0 {
            return Err(win_error("Could not start the print job"));
        }
        let mut job = SpoolJob(dc, false);
        for page_number in self.pages.iter().flat_map(|range| range.first..=range.last) {
            if cancelled.load(Relaxed) {
                return Ok(());
            }
            let page = pdf.page((page_number - 1) as i32)?;
            let [x, y, width, height, rotation] = fit_page(page.size(), device)?;
            if unsafe { StartPage(dc) } <= 0 {
                return Err(win_error("Could not start a print page"));
            }
            // PDFium receives the real printer DC. FPDF_ANNOT | FPDF_PRINTING
            // preserves printable annotation appearances from the PDF snapshot.
            if unsafe { (api.render_page)(dc, page.handle, x, y, width, height, rotation, 0x801) } == 0 {
                return Err(format!("PDFium could not render page {page_number}"));
            }
            if unsafe { EndPage(dc) } <= 0 {
                return Err(win_error("Could not finish a print page"));
            }
        }
        if !cancelled.load(Relaxed) {
            if unsafe { EndDoc(dc) } <= 0 {
                return Err(win_error("Could not submit the print job"));
            }
            job.1 = true;
        }
        Ok(())
    }
}

fn fit_page(page: [f64; 2], device: [i32; 4]) -> Result<[i32; 5], String> {
    if page.iter().any(|v| !v.is_finite() || *v <= 0.0) || device.iter().any(|v| *v <= 0) {
        return Err("Invalid PDF page size or printable area".into());
    }
    let [width, height, dpi_x, dpi_y] = device.map(f64::from);
    let [page_w, page_h] = page;
    let fit = |w: f64, h: f64| (width / (w * dpi_x)).min(height / (h * dpi_y));
    let straight = fit(page_w, page_h);
    let turned = fit(page_h, page_w);
    let (w, h, scale, rotation) = if turned > straight {
        (page_h, page_w, turned, 1)
    } else {
        (page_w, page_h, straight, 0)
    };
    let w = (w * dpi_x * scale).round().clamp(1.0, width) as i32;
    let h = (h * dpi_y * scale).round().clamp(1.0, height) as i32;
    Ok([(device[0] - w) / 2, (device[1] - h) / 2, w, h, rotation])
}

fn win_error(message: &str) -> String {
    format!("{message}: {}", std::io::Error::last_os_error())
}

struct Module(HMODULE);
impl Drop for Module {
    fn drop(&mut self) {
        unsafe { FreeLibrary(self.0) };
    }
}

type PdfHandle = *mut c_void;
type Close = unsafe extern "system" fn(PdfHandle);
struct Pdfium {
    _module: Module,
    destroy: unsafe extern "system" fn(),
    open: unsafe extern "system" fn(*const c_void, usize, *const c_char) -> PdfHandle,
    close_document: Close,
    page_count: unsafe extern "system" fn(PdfHandle) -> i32,
    load_page: unsafe extern "system" fn(PdfHandle, i32) -> PdfHandle,
    close_page: Close,
    page_width: unsafe extern "system" fn(PdfHandle) -> f32,
    page_height: unsafe extern "system" fn(PdfHandle) -> f32,
    render_page: unsafe extern "system" fn(HDC, PdfHandle, i32, i32, i32, i32, i32, i32) -> i32,
}

impl Pdfium {
    fn load(path: &Path) -> Result<Self, String> {
        let wide: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
        // The application supplies an absolute path to the pinned packaged DLL.
        let handle = unsafe {
            LoadLibraryExW(wide.as_ptr(), null_mut(),
                LOAD_LIBRARY_SEARCH_DEFAULT_DIRS | LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR)
        };
        if handle.is_null() {
            return Err(win_error("Could not load the bundled PDFium"));
        }
        let module = Module(handle);
        macro_rules! symbol {
            ($name:literal) => {{
                let entry = unsafe { GetProcAddress(handle, concat!($name, "\0").as_ptr()) }
                    .ok_or(concat!("Bundled PDFium is missing ", $name))?;
                // SAFETY: signatures are from the headers of the pinned x64 PDFium build.
                unsafe { std::mem::transmute(entry) }
            }};
        }
        let init: unsafe extern "system" fn() = symbol!("FPDF_InitLibrary");
        let api = Self {
            _module: module,
            destroy: symbol!("FPDF_DestroyLibrary"),
            open: symbol!("FPDF_LoadMemDocument64"),
            close_document: symbol!("FPDF_CloseDocument"),
            page_count: symbol!("FPDF_GetPageCount"),
            load_page: symbol!("FPDF_LoadPage"),
            close_page: symbol!("FPDF_ClosePage"),
            page_width: symbol!("FPDF_GetPageWidthF"),
            page_height: symbol!("FPDF_GetPageHeightF"),
            render_page: symbol!("FPDF_RenderPage"),
        };
        unsafe { init() };
        Ok(api)
    }

    fn open<'a>(&'a self, bytes: &'a [u8]) -> Result<Pdf<'a>, String> {
        // PDFium borrows the buffer until the document closes.
        let handle = unsafe { (self.open)(bytes.as_ptr().cast(), bytes.len(), null()) };
        if handle.is_null() {
            return Err("PDFium could not open the print snapshot".into());
        }
        Ok(Pdf { handle, api: self, _bytes: bytes })
    }
}
impl Drop for Pdfium {
    fn drop(&mut self) {
        unsafe { (self.destroy)() };
    }
}

struct Pdf<'a> { handle: PdfHandle, api: &'a Pdfium, _bytes: &'a [u8] }
impl Pdf<'_> {
    fn page(&self, index: i32) -> Result<PdfPage<'_>, String> {
        let handle = unsafe { (self.api.load_page)(self.handle, index) };
        if handle.is_null() {
            return Err(format!("PDFium could not load page {}", index + 1));
        }
        Ok(PdfPage { handle, api: self.api })
    }
}
impl Drop for Pdf<'_> {
    fn drop(&mut self) {
        unsafe { (self.api.close_document)(self.handle) };
    }
}

struct PdfPage<'a> { handle: PdfHandle, api: &'a Pdfium }
impl PdfPage<'_> {
    fn size(&self) -> [f64; 2] {
        unsafe { [(self.api.page_width)(self.handle).into(), (self.api.page_height)(self.handle).into()] }
    }
}
impl Drop for PdfPage<'_> {
    fn drop(&mut self) {
        unsafe { (self.api.close_page)(self.handle) };
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_ranges_and_keeps_original_page_numbers() {
        let requested = [
            PRINTPAGERANGE { nFromPage: 190, nToPage: 190 },
            PRINTPAGERANGE { nFromPage: 15, nToPage: 17 },
            PRINTPAGERANGE { nFromPage: 16, nToPage: 16 },
        ];
        let pages = page_ranges(PD_PAGENUMS, 200, 28, &requested).unwrap();
        assert_eq!(pages, vec![PageRange { first: 15, last: 17 }, PageRange { first: 190, last: 190 }]);
        assert_eq!(page_ranges(PD_CURRENTPAGE, 200, 28, &[]).unwrap(), vec![PageRange { first: 28, last: 28 }]);
        assert_eq!(page_ranges(0, 200, 28, &[]).unwrap(), vec![PageRange { first: 1, last: 200 }]);
        assert!(page_ranges(PD_PAGENUMS, 100, 28, &requested).is_err());
    }

    #[test]
    fn fits_landscape_and_preserves_physical_aspect_ratio() {
        assert_eq!(fit_page([600.0, 300.0], [600, 1200, 300, 600]).unwrap(), [0, 300, 600, 600, 0]);
        assert_eq!(fit_page([800.0, 400.0], [600, 1000, 300, 300]).unwrap(), [50, 0, 500, 1000, 1]);
        assert!(fit_page([600.0, 400.0], [0, 1000, 300, 300]).is_err());
    }
}
