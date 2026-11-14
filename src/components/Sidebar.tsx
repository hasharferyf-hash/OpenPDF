import { memo, useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import {
  firstPageRatio,
  readOutline,
  renderThumbnail,
  type OutlineItem,
  type ThumbnailHandle,
} from "../services/pdf/documentInfo";
import type { ViewerController, ViewerState } from "../services/pdf/viewerController";
import { Icon } from "./Icon";

const THUMB_WIDTH = 132;

interface ThumbnailProps {
  controller: ViewerController;
  pageNumber: number;
  rotation: number;
  ratio: number;
  current: boolean;
  label: string;
  observer: IntersectionObserver | null;
  visible: boolean;
}

const Thumbnail = memo(function Thumbnail(props: ThumbnailProps) {
  const { controller, pageNumber, rotation, visible, observer } = props;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const frameRef = useRef<HTMLSpanElement>(null);
  // Pages may differ in size; the document-wide estimate is replaced once this page is known.
  const [ownRatio, setOwnRatio] = useState<{ rotation: number; value: number } | null>(null);
  const ratio = ownRatio?.rotation === rotation ? ownRatio.value : props.ratio;

  useEffect(() => {
    const element = buttonRef.current;
    if (!element || !observer) return;
    observer.observe(element);
    return () => observer.unobserve(element);
  }, [observer]);

  // Render only while near the viewport; release the bitmap when scrolled far away.
  useEffect(() => {
    const frame = frameRef.current;
    const doc = controller.document;
    if (!frame || !doc || !visible) return;
    // A fresh canvas per render: PDF.js refuses to draw on a canvas whose previous task is still winding down.
    const canvas = document.createElement("canvas");
    frame.replaceChildren(canvas);
    let handle: ThumbnailHandle | null = renderThumbnail(doc, pageNumber, canvas, THUMB_WIDTH, rotation);
    handle.promise.catch(() => undefined);
    void handle.ratio.then((value) => value && handle && setOwnRatio({ rotation, value }));
    return () => {
      handle?.cancel();
      handle = null;
      canvas.remove();
      canvas.width = canvas.height = 0;
    };
  }, [controller, pageNumber, rotation, visible]);

  useEffect(() => {
    if (props.current) buttonRef.current?.scrollIntoView({ block: "nearest" });
  }, [props.current]);

  return (
    <button
      ref={buttonRef}
      type="button"
      data-page={pageNumber}
      className={"thumbnail" + (props.current ? " is-current" : "")}
      aria-label={props.label}
      aria-current={props.current ? "page" : undefined}
      onClick={() => controller.goToPage(pageNumber)}
    >
      <span ref={frameRef} className="thumbnail-frame" style={{ width: THUMB_WIDTH, height: Math.round(THUMB_WIDTH * ratio) }} />
      <span className="thumbnail-number">{pageNumber}</span>
    </button>
  );
});

function Thumbnails({ controller, state }: { controller: ViewerController; state: ViewerState }) {
  const { t } = useI18n();
  const listRef = useRef<HTMLDivElement>(null);
  const [observer, setObserver] = useState<IntersectionObserver | null>(null);
  const [visible, setVisible] = useState<ReadonlySet<number>>(new Set());
  const [ratio, setRatio] = useState(1.414);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) =>
        setVisible((previous) => {
          const next = new Set(previous);
          for (const entry of entries) {
            const page = Number((entry.target as HTMLElement).dataset.page);
            if (entry.isIntersecting) next.add(page);
            else next.delete(page);
          }
          return next;
        }),
      { root: listRef.current, rootMargin: "600px 0px" },
    );
    setObserver(io);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const doc = controller.document;
    if (!doc) return;
    let stale = false;
    firstPageRatio(doc, state.rotation).then(
      (value) => !stale && setRatio(value),
      () => undefined,
    );
    return () => {
      stale = true;
    };
  }, [controller, state.hasDocument, state.pageCount, state.rotation]);

  return (
    <div className="thumbnail-list" ref={listRef}>
      {Array.from({ length: state.pageCount }, (_, index) => (
        <Thumbnail
          key={index + 1}
          controller={controller}
          pageNumber={index + 1}
          rotation={state.rotation}
          ratio={ratio}
          current={state.page === index + 1}
          label={t("pageOf", { page: index + 1, count: state.pageCount })}
          observer={observer}
          visible={visible.has(index + 1)}
        />
      ))}
    </div>
  );
}

function OutlineTree({ items, controller }: { items: OutlineItem[]; controller: ViewerController }) {
  return (
    <ul className="outline-list">
      {items.map((item, index) => (
        <OutlineNode key={index} item={item} controller={controller} />
      ))}
    </ul>
  );
}

function OutlineNode({ item, controller }: { item: OutlineItem; controller: ViewerController }) {
  const [open, setOpen] = useState(false);
  const hasChildren = item.items.length > 0;
  return (
    <li>
      <div className="outline-row">
        {hasChildren ? (
          <button type="button" className={"outline-toggle" + (open ? " is-open" : "")} aria-expanded={open} aria-label={item.title} onClick={() => setOpen(!open)}>
            <Icon name="down" size={14} />
          </button>
        ) : (
          <span className="outline-toggle" />
        )}
        <button type="button" className="outline-link" dir="auto" onClick={() => item.dest && controller.goToDestination(item.dest)}>
          {item.title}
        </button>
      </div>
      {hasChildren && open && <OutlineTree items={item.items} controller={controller} />}
    </li>
  );
}

export function Sidebar({ controller, state }: { controller: ViewerController; state: ViewerState }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<"thumbnails" | "outline">("thumbnails");
  const [outline, setOutline] = useState<OutlineItem[]>([]);

  useEffect(() => {
    const doc = controller.document;
    setOutline([]);
    setTab("thumbnails");
    if (!doc) return;
    let stale = false;
    void readOutline(doc).then((items) => !stale && setOutline(items));
    return () => {
      stale = true;
    };
  }, [controller, state.hasDocument, state.pageCount]);

  return (
    <aside className="sidebar" aria-label={t("toggleSidebar")}>
      <div className="sidebar-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "thumbnails"} title={t("thumbnails")} aria-label={t("thumbnails")} className={tab === "thumbnails" ? "is-active" : ""} onClick={() => setTab("thumbnails")}>
          <Icon name="thumbnails" size={18} />
        </button>
        <button type="button" role="tab" aria-selected={tab === "outline"} title={t("outline")} aria-label={t("outline")} className={tab === "outline" ? "is-active" : ""} onClick={() => setTab("outline")}>
          <Icon name="outline" size={18} />
        </button>
      </div>
      {tab === "thumbnails" ? (
        <Thumbnails controller={controller} state={state} />
      ) : outline.length ? (
        <div className="outline-panel">
          <OutlineTree items={outline} controller={controller} />
        </div>
      ) : (
        <p className="sidebar-empty">{t("noOutline")}</p>
      )}
    </aside>
  );
}
