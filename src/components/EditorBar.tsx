import { useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { HIGHLIGHT_COLORS, type ViewerController, type ViewerState } from "../services/pdf/viewerController";
import { IconButton } from "./Icon";

const PEN_COLORS = ["#000000", "#e53935", "#1e88e5", "#43a047", "#fb8c00", "#8e24aa", "#ffffff"];
const TEXT_SIZES = [8, 10, 12, 14, 18, 24, 32, 48];

function Swatches(props: { colors: string[]; value: string; label: string; onPick(color: string): void }) {
  return (
    <div className="swatches" role="radiogroup" aria-label={props.label}>
      {props.colors.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={props.value === color}
          aria-label={color}
          className={"swatch" + (props.value === color ? " is-selected" : "")}
          style={{ background: color }}
          onClick={() => props.onPick(color)}
        />
      ))}
    </div>
  );
}

/** The secondary bar shown while a drawing, highlighting or text tool is active. */
export function EditorBar({ controller, state }: { controller: ViewerController; state: ViewerState }) {
  const { t } = useI18n();
  const [inkColor, setInkColor] = useState(PEN_COLORS[1]);
  const [thickness, setThickness] = useState(3);
  const [opacity, setOpacity] = useState(100);
  const [textColor, setTextColor] = useState(PEN_COLORS[0]);
  const [textSize, setTextSize] = useState(14);
  const [highlightColor, setHighlightColor] = useState(HIGHLIGHT_COLORS.yellow);

  // Re-apply the chosen style whenever a tool becomes active (also after opening a new document).
  useEffect(() => {
    if (state.tool === "ink") controller.setInkStyle({ color: inkColor, thickness, opacity: opacity / 100 });
    else if (state.tool === "text") controller.setTextStyle({ color: textColor, size: textSize });
    else if (state.tool === "highlight") controller.setHighlightColor(highlightColor);
  }, [controller, state.tool, state.hasDocument, inkColor, thickness, opacity, textColor, textSize, highlightColor]);

  if (state.tool === "none") return null;

  return (
    <div className="editor-bar" role="toolbar" aria-label={t(state.tool === "ink" ? "draw" : state.tool === "text" ? "addText" : "highlight")}>
      {state.tool === "ink" && (
        <>
          <Swatches colors={PEN_COLORS} value={inkColor} label={t("color")} onPick={setInkColor} />
          <input
            className="color-input"
            type="color"
            aria-label={t("color")}
            title={t("color")}
            value={inkColor}
            onChange={(event) => setInkColor(event.target.value)}
          />
          <label className="slider">
            <span>{t("thickness")}</span>
            <input type="range" min={1} max={20} value={thickness} onChange={(event) => setThickness(Number(event.target.value))} />
          </label>
          <label className="slider">
            <span>{t("opacity")}</span>
            <input type="range" min={10} max={100} step={5} value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} />
          </label>
        </>
      )}
      {state.tool === "text" && (
        <>
          <Swatches colors={PEN_COLORS.slice(0, 6)} value={textColor} label={t("color")} onPick={setTextColor} />
          <input
            className="color-input"
            type="color"
            aria-label={t("color")}
            title={t("color")}
            value={textColor}
            onChange={(event) => setTextColor(event.target.value)}
          />
          <label className="slider">
            <span>{t("fontSize")}</span>
            <select value={textSize} onChange={(event) => setTextSize(Number(event.target.value))}>
              {TEXT_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <span className="editor-hint">{t("textHint")}</span>
        </>
      )}
      {state.tool === "highlight" && (
        <>
          <Swatches
            colors={Object.values(HIGHLIGHT_COLORS)}
            value={highlightColor}
            label={t("color")}
            onPick={setHighlightColor}
          />
          <span className="editor-hint">{t("highlightHint")}</span>
        </>
      )}
      <span className="editor-spacer" />
      <IconButton icon="undo" label={`${t("undo")} (Ctrl+Z)`} disabled={!state.canUndo} onClick={() => controller.undo()} flipInRtl />
      <IconButton icon="redo" label={`${t("redo")} (Ctrl+Y)`} disabled={!state.canRedo} onClick={() => controller.redo()} flipInRtl />
      <IconButton
        icon="trash"
        label={`${t("deleteSelected")} (Delete)`}
        disabled={!state.hasSelectedEditor}
        onClick={() => controller.deleteSelected()}
      />
      <button type="button" className="text-button" onClick={() => controller.setTool("none")}>
        {t("doneEditing")}
      </button>
    </div>
  );
}
