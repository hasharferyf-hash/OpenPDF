import { createContext, useContext } from "react";

const en = {
  appTagline: "A light, clean PDF viewer",
  openFile: "Open file",
  openHint: "Choose a PDF or drag it into this window.",
  dropHere: "Drop the PDF here",
  toggleSidebar: "Thumbnails and outline",
  thumbnails: "Thumbnails",
  outline: "Outline",
  noOutline: "This document has no outline.",
  page: "Page",
  pageOf: "Page {page} of {count}",
  previousPage: "Previous page",
  nextPage: "Next page",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  zoomLevel: "Zoom level",
  fitToPage: "Fit to page",
  fitToWidth: "Fit to width",
  actualSize: "Actual size (100%)",
  rotateCw: "Rotate clockwise",
  rotateCcw: "Rotate counterclockwise",
  draw: "Draw",
  highlight: "Highlight",
  addText: "Add text",
  undo: "Undo",
  redo: "Redo",
  deleteSelected: "Delete selected",
  doneEditing: "Done",
  color: "Color",
  thickness: "Thickness",
  opacity: "Opacity",
  fontSize: "Font size",
  highlightHint: "Select text to highlight it, or drag to highlight freely.",
  textHint: "Click on the page to add text.",
  download: "Save a copy",
  print: "Print",
  more: "More actions",
  twoPageView: "Two-page view",
  showAnnotations: "Annotations",
  present: "Present",
  exitPresent: "Exit presentation",
  documentProperties: "Document properties",
  find: "Find in document",
  findPlaceholder: "Find in document",
  findPrevious: "Previous match",
  findNext: "Next match",
  matchCase: "Match case",
  wholeWords: "Whole words",
  noMatches: "No results",
  close: "Close",
  language: "עברית",
  loading: "Opening…",
  preparingPrint: "Preparing {done} of {count} pages for printing…",
  cancel: "Cancel",
  ok: "OK",
  passwordTitle: "Password required",
  passwordPrompt: "This document is protected. Enter its password to open it.",
  passwordWrong: "Incorrect password. Try again.",
  password: "Password",
  errorTitle: "Couldn't open the file",
  errorInvalid: "The file is damaged or is not a valid PDF.",
  errorNotPdf: "Please choose a PDF file.",
  errorSave: "Couldn't save the file.",
  errorPrint: "Couldn't print the document.",
  saved: "Saved to {name}",
  unsavedTitle: "Unsaved changes",
  unsavedPrompt: "Your drawings and notes on this document haven't been saved. Continue without saving?",
  discard: "Continue without saving",
  propFileName: "File name",
  propFileSize: "File size",
  propLocation: "Location",
  propTitle: "Title",
  propAuthor: "Author",
  propSubject: "Subject",
  propKeywords: "Keywords",
  propCreated: "Created",
  propModified: "Modified",
  propCreator: "Application",
  propProducer: "PDF producer",
  propVersion: "PDF version",
  propPageCount: "Page count",
  propPageSize: "Page size",
  portrait: "portrait",
  landscape: "landscape",
};

export type MessageKey = keyof typeof en;

const he: Record<MessageKey, string> = {
  appTagline: "מציג PDF קליל ונקי",
  openFile: "פתיחת קובץ",
  openHint: "בחרו קובץ PDF או גררו אותו לחלון.",
  dropHere: "שחררו כאן את הקובץ",
  toggleSidebar: "תמונות ממוזערות ותוכן עניינים",
  thumbnails: "תמונות ממוזערות",
  outline: "תוכן עניינים",
  noOutline: "למסמך הזה אין תוכן עניינים.",
  page: "עמוד",
  pageOf: "עמוד {page} מתוך {count}",
  previousPage: "העמוד הקודם",
  nextPage: "העמוד הבא",
  zoomIn: "הגדלה",
  zoomOut: "הקטנה",
  zoomLevel: "רמת זום",
  fitToPage: "התאמה לדף",
  fitToWidth: "התאמה לרוחב",
  actualSize: "גודל מקורי (100%)",
  rotateCw: "סיבוב עם כיוון השעון",
  rotateCcw: "סיבוב נגד כיוון השעון",
  draw: "שרבוט",
  highlight: "הדגשה",
  addText: "הוספת טקסט",
  undo: "ביטול",
  redo: "ביצוע מחדש",
  deleteSelected: "מחיקת הפריט שנבחר",
  doneEditing: "סיום",
  color: "צבע",
  thickness: "עובי",
  opacity: "אטימות",
  fontSize: "גודל גופן",
  highlightHint: "סמנו טקסט כדי להדגיש אותו, או גררו להדגשה חופשית.",
  textHint: "לחצו על הדף כדי להוסיף טקסט.",
  download: "שמירת עותק",
  print: "הדפסה",
  more: "פעולות נוספות",
  twoPageView: "תצוגת שני עמודים",
  showAnnotations: "הערות",
  present: "מצגת",
  exitPresent: "יציאה ממצגת",
  documentProperties: "מאפייני המסמך",
  find: "חיפוש במסמך",
  findPlaceholder: "חיפוש במסמך",
  findPrevious: "התוצאה הקודמת",
  findNext: "התוצאה הבאה",
  matchCase: "התאמת רישיות",
  wholeWords: "מילים שלמות",
  noMatches: "אין תוצאות",
  close: "סגירה",
  language: "English",
  loading: "פותח…",
  preparingPrint: "מכין להדפסה {done} מתוך {count} עמודים…",
  cancel: "ביטול",
  ok: "אישור",
  passwordTitle: "נדרשת סיסמה",
  passwordPrompt: "המסמך מוגן. הזינו את הסיסמה כדי לפתוח אותו.",
  passwordWrong: "הסיסמה שגויה. נסו שוב.",
  password: "סיסמה",
  errorTitle: "לא ניתן לפתוח את הקובץ",
  errorInvalid: "הקובץ פגום או שאינו קובץ PDF תקין.",
  errorNotPdf: "יש לבחור קובץ PDF.",
  errorSave: "לא ניתן לשמור את הקובץ.",
  errorPrint: "לא ניתן להדפיס את המסמך.",
  saved: "נשמר אל {name}",
  unsavedTitle: "שינויים שלא נשמרו",
  unsavedPrompt: "השרבוטים וההערות שהוספתם למסמך לא נשמרו. להמשיך בלי לשמור?",
  discard: "להמשיך בלי לשמור",
  propFileName: "שם הקובץ",
  propFileSize: "גודל הקובץ",
  propLocation: "מיקום",
  propTitle: "כותרת",
  propAuthor: "מחבר",
  propSubject: "נושא",
  propKeywords: "מילות מפתח",
  propCreated: "נוצר",
  propModified: "שונה",
  propCreator: "יישום",
  propProducer: "יוצר ה-PDF",
  propVersion: "גרסת PDF",
  propPageCount: "מספר עמודים",
  propPageSize: "גודל הדף",
  portrait: "לאורך",
  landscape: "לרוחב",
};

export type Language = "en" | "he";

const dictionaries: Record<Language, Record<MessageKey, string>> = { en, he };
const STORAGE_KEY = "openpdf.language";

export function initialLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "he") return stored;
  } catch {
    // Storage may be unavailable; fall back to the system language.
  }
  return navigator.language.toLowerCase().startsWith("he") ? "he" : "en";
}

export function storeLanguage(language: Language) {
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Not critical.
  }
}

export type Translate = (key: MessageKey, values?: Record<string, string | number>) => string;

export function translator(language: Language): Translate {
  const dictionary = dictionaries[language];
  return (key, values) =>
    dictionary[key].replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name] ?? ""));
}

export const I18nContext = createContext<{ t: Translate; language: Language }>({
  t: translator("en"),
  language: "en",
});

export const useI18n = () => useContext(I18nContext);
