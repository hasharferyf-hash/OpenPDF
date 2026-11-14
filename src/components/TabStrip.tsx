import { useEffect, useRef } from "react";
import { useI18n } from "../i18n";
import type { DocumentTab } from "../services/tabs";
import { Icon, IconButton } from "./Icon";

export function TabStrip(props: {
  tabs: readonly DocumentTab[];
  activeId: number;
  onActivate(id: number): void;
  onClose(id: number): void;
  onNew(): void;
}) {
  const { t, language } = useI18n();
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`#document-tab-${props.activeId}`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [props.activeId]);
  return (
    <div className="tab-strip">
      <div ref={list} className="document-tabs" role="tablist" aria-label={t("documentTabs")}>
        {props.tabs.map((tab, index) => (
          <div key={tab.id} className={"document-tab" + (tab.id === props.activeId ? " is-active" : "")}
            onAuxClick={(event) => { if (event.button === 1) { event.preventDefault(); props.onClose(tab.id); } }}>
            <button type="button" id={`document-tab-${tab.id}`} role="tab" aria-selected={tab.id === props.activeId}
              aria-controls={`document-panel-${tab.id}`} tabIndex={tab.id === props.activeId ? 0 : -1}
              className="document-tab-select" title={tab.name ?? t("newTab")}
              aria-label={`${tab.name ?? t("newTab")}${tab.modified ? ` — ${t("unsavedTitle")}` : ""}`}
              onClick={() => props.onActivate(tab.id)} onKeyDown={(event) => {
                if (event.ctrlKey || event.metaKey || event.altKey) return;
                if (event.key === "Delete") { event.preventDefault(); event.stopPropagation(); props.onClose(tab.id); return; }
                let next: number;
                if (event.key === "Home") next = 0;
                else if (event.key === "End") next = props.tabs.length - 1;
                else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                  const forward = (event.key === "ArrowRight") !== (language === "he");
                  next = (index + (forward ? 1 : -1) + props.tabs.length) % props.tabs.length;
                } else return;
                event.preventDefault(); event.stopPropagation();
                const selected = props.tabs[next];
                props.onActivate(selected.id);
                requestAnimationFrame(() => list.current?.querySelector<HTMLElement>(`#document-tab-${selected.id}`)?.focus());
              }}>
              <Icon name="twoPages" size={15} />
              <span className="document-tab-name" dir="auto">{tab.name ?? t("newTab")}</span>
              {tab.modified && <span className="tab-dirty" aria-hidden="true">●</span>}
            </button>
            <button type="button" className="tab-close" aria-label={t("closeTabNamed", { name: tab.name ?? t("newTab") })}
              title={`${t("closeTab")} (Ctrl+W)`} tabIndex={tab.id === props.activeId ? 0 : -1} onClick={() => props.onClose(tab.id)}>
              <Icon name="close" size={13} />
            </button>
          </div>
        ))}
      </div>
      <IconButton icon="plus" label={`${t("newTab")} (Ctrl+T)`} onClick={props.onNew} />
    </div>
  );
}
