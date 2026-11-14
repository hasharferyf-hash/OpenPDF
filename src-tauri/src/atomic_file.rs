use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

static NEXT_TEMP_FILE: AtomicU64 = AtomicU64::new(0);

struct TemporaryFile(PathBuf);

impl Drop for TemporaryFile {
    fn drop(&mut self) {
        // On success the path has already been renamed; on failure remove only
        // the temporary file we created, never the user's destination.
        let _ = fs::remove_file(&self.0);
    }
}

/// Write and flush beside the destination, then replace it in one rename.
/// Keeping both files on the same volume is required for atomic replacement.
pub fn write_atomically(path: &Path, data: &[u8]) -> io::Result<()> {
    replace_with(path, |file| file.write_all(data))
}

fn replace_with(path: &Path, write: impl FnOnce(&mut File) -> io::Result<()>) -> io::Result<()> {
    let parent = path.parent().ok_or_else(|| {
        io::Error::new(io::ErrorKind::InvalidInput, "The PDF path has no parent directory")
    })?;
    let (temporary, mut file) = loop {
        let sequence = NEXT_TEMP_FILE.fetch_add(1, Ordering::Relaxed);
        let candidate = parent.join(format!(".openpdf-{}-{sequence}.tmp", std::process::id()));
        match OpenOptions::new().write(true).create_new(true).open(&candidate) {
            Ok(file) => break (TemporaryFile(candidate), file),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error),
        }
    };

    // Close the handle before cleanup or rename, including on write/sync error
    // (Windows does not allow removing an open file without delete sharing).
    let result = write(&mut file).and_then(|()| file.sync_all());
    drop(file);
    result?;
    fs::rename(&temporary.0, path)
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new() -> Self {
            let sequence = NEXT_TEMP_FILE.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "openpdf-atomic-test-{}-{sequence}", std::process::id()
            ));
            fs::create_dir(&path).unwrap();
            Self(path)
        }

        fn assert_only(&self, name: &str) {
            let names: Vec<_> = fs::read_dir(&self.0).unwrap()
                .map(|entry| entry.unwrap().file_name()).collect();
            assert_eq!(names, vec![std::ffi::OsString::from(name)]);
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn creates_and_replaces_a_pdf_without_temporary_files() {
        let directory = TestDirectory::new();
        let path = directory.0.join("שלום.pdf");
        write_atomically(&path, b"original PDF").unwrap();
        write_atomically(&path, b"replacement").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"replacement");
        directory.assert_only("שלום.pdf");
    }

    #[test]
    fn partial_write_failure_preserves_the_original() {
        let directory = TestDirectory::new();
        let path = directory.0.join("original.pdf");
        fs::write(&path, b"original PDF").unwrap();
        let result = replace_with(&path, |file| {
            file.write_all(b"partial replacement")?;
            Err(io::Error::other("simulated full disk"))
        });
        assert!(result.is_err());
        assert_eq!(fs::read(&path).unwrap(), b"original PDF");
        directory.assert_only("original.pdf");
    }

    #[test]
    fn failed_rename_preserves_the_destination_and_cleans_up() {
        let directory = TestDirectory::new();
        let path = directory.0.join("existing.pdf");
        fs::create_dir(&path).unwrap();
        fs::write(path.join("keep.txt"), b"keep").unwrap();
        assert!(write_atomically(&path, b"replacement").is_err());
        assert_eq!(fs::read(path.join("keep.txt")).unwrap(), b"keep");
        directory.assert_only("existing.pdf");
    }

    #[cfg(windows)]
    #[test]
    fn locked_destination_preserves_the_original() {
        use std::os::windows::fs::OpenOptionsExt;

        let directory = TestDirectory::new();
        let path = directory.0.join("locked.pdf");
        fs::write(&path, b"original PDF").unwrap();
        let lock = OpenOptions::new().read(true).share_mode(1).open(&path).unwrap();
        assert!(write_atomically(&path, b"replacement").is_err());
        assert_eq!(fs::read(&path).unwrap(), b"original PDF");
        drop(lock);
        directory.assert_only("locked.pdf");
    }
}
