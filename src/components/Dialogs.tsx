import { useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n, type Language, type Translate } from "../i18n";
import { readDocumentInfo, type DocumentInfo } from "../services/pdf/documentInfo";
import type { ViewerController } from "../services/pdf/viewerController";

function Dialog(props: { title: string; onClose(): void; children: ReactNode; actions: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog"
      onCancel={(event) => {
        event.preventDefault();
        props.onClose();
      }}
    >
      <h2>{props.title}</h2>
      <div className="dialog-body">{props.children}</div>
      <div className="dialog-actions">{props.actions}</div>
    </dialog>
  );
}

export function MessageDialog(props: { title: string; message: string; onClose(): void }) {
  const { t } = useI18n();
  return (
    <Dialog
      title={props.title}
      onClose={props.onClose}
      actions={
        <button type="button" className="primary-button" autoFocus onClick={props.onClose}>
          {t("ok")}
        </button>
      }
    >
      <p>{props.message}</p>
    </Dialog>
  );
}

export function ConfirmDialog(props: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm(): void;
  onCancel(): void;
}) {
  const { t } = useI18n();
  return (
    <Dialog
      title={props.title}
      onClose={props.onCancel}
      actions={
        <>
          <button type="button" className="text-button" onClick={props.onConfirm}>
            {props.confirmLabel}
          </button>
          <button type="button" className="primary-button" autoFocus onClick={props.onCancel}>
            {t("cancel")}
          </button>
        </>
      }
    >
      <p>{props.message}</p>
    </Dialog>
  );
}

export function PasswordDialog(props: { wrong: boolean; onSubmit(password: string | null): void }) {
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  return (
    <Dialog
      title={t("passwordTitle")}
      onClose={() => props.onSubmit(null)}
      actions={
        <>
          <button type="button" className="text-button" onClick={() => props.onSubmit(null)}>
            {t("cancel")}
          </button>
          <button type="submit" form="password-form" className="primary-button" disabled={!password}>
            {t("ok")}
          </button>
        </>
      }
    >
      <form
        id="password-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (password) props.onSubmit(password);
        }}
      >
        <p>{props.wrong ? t("passwordWrong") : t("passwordPrompt")}</p>
        <input
          className="dialog-input"
          type="password"
          dir="ltr"
          autoFocus
          autoComplete="off"
          aria-label={t("password")}
          placeholder={t("password")}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </form>
    </Dialog>
  );
}

export function ProgressDialog(props: { message: string; onCancel(): void }) {
  const { t } = useI18n();
  return (
    <Dialog
      title={t("print")}
      onClose={props.onCancel}
      actions={
        <button type="button" className="text-button" onClick={props.onCancel}>
          {t("cancel")}
        </button>
      }
    >
      <p aria-live="polite">{props.message}</p>
    </Dialog>
  );
}

function formatBytes(bytes: number, language: Language) {
  const format = (value: number, unit: string) =>
    `${value.toLocaleString(language, { maximumFractionDigits: value < 10 ? 2 : 1 })} ${unit}`;
  if (bytes < 1024) return format(bytes, "B");
  if (bytes < 1024 ** 2) return format(bytes / 1024, "KB");
  if (bytes < 1024 ** 3) return format(bytes / 1024 ** 2, "MB");
  return format(bytes / 1024 ** 3, "GB");
}

const PAPER_SIZES: [string, number, number][] = [
  ["A3", 297, 420],
  ["A4", 210, 297],
  ["A5", 148, 210],
  ["Letter", 215.9, 279.4],
  ["Legal", 215.9, 355.6],
];

function formatPageSize(size: { width: number; height: number }, t: Translate) {
  const mm = (points: number) => (points / 72) * 25.4;
  const width = mm(size.width);
  const height = mm(size.height);
  const short = Math.min(width, height);
  const long = Math.max(width, height);
  const paper = PAPER_SIZES.find(([, w, h]) => Math.abs(w - short) < 2 && Math.abs(h - long) < 2);
  const orientation = t(height >= width ? "portrait" : "landscape");
  const dimensions = `${width.toFixed(0)} × ${height.toFixed(0)} mm`;
  return `${dimensions} (${paper ? `${paper[0]}, ` : ""}${orientation})`;
}

export function PropertiesDialog(props: {
  controller: ViewerController;
  fileName: string;
  filePath?: string;
  onClose(): void;
}) {
  const { t, language } = useI18n();
  const [info, setInfo] = useState<DocumentInfo | null>(null);

  useEffect(() => {
    const doc = props.controller.document;
    if (!doc) return;
    let stale = false;
    void readDocumentInfo(doc).then((value) => !stale && setInfo(value));
    return () => {
      stale = true;
    };
  }, [props.controller]);

  const date = (value?: Date) =>
    value?.toLocaleString(language, { dateStyle: "medium", timeStyle: "short" });
  const folder = props.filePath?.replace(/[\\/][^\\/]*$/, "");
  const rows: [string, string | undefined][] = [
    [t("propFileName"), props.fileName],
    [t("propFileSize"), info?.fileSize !== undefined ? formatBytes(info.fileSize, language) : undefined],
    [t("propLocation"), folder],
    [t("propTitle"), info?.title],
    [t("propAuthor"), info?.author],
    [t("propSubject"), info?.subject],
    [t("propKeywords"), info?.keywords],
    [t("propCreated"), date(info?.created)],
    [t("propModified"), date(info?.modified)],
    [t("propCreator"), info?.creator],
    [t("propProducer"), info?.producer],
    [t("propVersion"), info?.pdfVersion],
    [t("propPageCount"), info ? String(info.pageCount) : undefined],
    [t("propPageSize"), info?.pageSize ? formatPageSize(info.pageSize, t) : undefined],
  ];

  return (
    <Dialog
      title={t("documentProperties")}
      onClose={props.onClose}
      actions={
        <button type="button" className="primary-button" autoFocus onClick={props.onClose}>
          {t("close")}
        </button>
      }
    >
      <dl className="properties">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd dir="auto">{value || "–"}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}
