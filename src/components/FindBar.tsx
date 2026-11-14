import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import type { FindState, ViewerController } from "../services/pdf/viewerController";
import { IconButton } from "./Icon";

interface FindBarProps {
  controller: ViewerController;
  findState: FindState;
  /** Changes every time the user presses Ctrl+F so the field is re-focused. */
  focusToken: number;
  onClose(): void;
}

export function FindBar({ controller, findState, focusToken, onClose }: FindBarProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [entireWord, setEntireWord] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusToken]);

  // Search as the user types, slightly debounced.
  useEffect(() => {
    const timer = setTimeout(() => controller.find({ query, caseSensitive, entireWord }), 150);
    return () => clearTimeout(timer);
  }, [controller, query, caseSensitive, entireWord]);

  useEffect(() => () => controller.closeFind(), [controller]);

  const step = (direction: "next" | "previous") => {
    if (query) controller.find({ query, caseSensitive, entireWord }, direction);
  };

  const status = !query
    ? ""
    : findState.total > 0
      ? `${findState.current}/${findState.total}`
      : findState.notFound
        ? t("noMatches")
        : "";

  return (
    <div className="find-bar" role="search">
      <input
        ref={inputRef}
        className={"find-input" + (query && findState.notFound ? " is-missing" : "")}
        type="text"
        dir="auto"
        spellCheck={false}
        placeholder={t("findPlaceholder")}
        aria-label={t("find")}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            step(event.shiftKey ? "previous" : "next");
          } else if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
      />
      <span className="find-status" dir="ltr" aria-live="polite">
        {status}
      </span>
      <span className="separator" />
      <button type="button" className={"chip" + (caseSensitive ? " is-active" : "")} aria-pressed={caseSensitive} title={t("matchCase")} aria-label={t("matchCase")} onClick={() => setCaseSensitive(!caseSensitive)}>
        Aa
      </button>
      <button type="button" className={"chip" + (entireWord ? " is-active" : "")} aria-pressed={entireWord} title={t("wholeWords")} aria-label={t("wholeWords")} onClick={() => setEntireWord(!entireWord)}>
        “ab”
      </button>
      <IconButton icon="up" label={`${t("findPrevious")} (Shift+Enter)`} disabled={!findState.total} onClick={() => step("previous")} />
      <IconButton icon="down" label={`${t("findNext")} (Enter)`} disabled={!findState.total} onClick={() => step("next")} />
      <IconButton icon="close" label={t("close")} onClick={onClose} />
    </div>
  );
}
