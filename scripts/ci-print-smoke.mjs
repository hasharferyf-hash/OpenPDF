import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { AnnotationEditorType, getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const pageCount = 200;
const printDir = process.env.OPENPDF_CI_PRINT_DIR;
assert(process.env.GITHUB_ACTIONS === "true" && printDir, "Run on the isolated GitHub Actions printer");
const standardFontDataUrl = fileURLToPath(new URL("../node_modules/pdfjs-dist/standard_fonts/", import.meta.url))
  .replaceAll("\\", "/");
const openPdf = (bytes) => getDocument({ data: new Uint8Array(bytes), standardFontDataUrl });

function sourcePdf() {
  const kids = Array.from({ length: pageCount }, (_, index) => `${4 + 2 * index} 0 R`).join(" ");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  for (let page = 1; page <= pageCount; page++) {
    const width = page === 190 ? 792 : 612;
    const height = page === 190 ? 612 : 792;
    // Colored registration marks identify each selected page even if the
    // printer converts text to paths or bitmaps.
    const mark = page === 15 ? "0 0.75 0.9 rg" : page === 190 ? "1 0.5 0 rg" : "0 0 0 rg";
    const content = `BT /F1 24 Tf 72 ${height - 100} Td (OpenPDF test page ${page}) Tj ET\n${mark} 80 180 180 80 re f`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + 2 * (page - 1)} 0 R >>`,
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    );
  }
  let pdf = "%PDF-1.7\n";
  const offsets = [];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Root 1 0 R /Size ${objects.length + 1} >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "ascii");
}

async function prepareSnapshot() {
  const source = sourcePdf();
  const task = openPdf(source);
  try {
    const doc = await task.promise;
    const page = await doc.getPage(15);
    assert.deepEqual(await page.getAnnotations(), []);
    // This is the value format produced by the PDF.js FreeText editor.
    doc.annotationStorage.setValue("pdfjs_internal_editor_0", {
      annotationType: AnnotationEditorType.FREETEXT,
      pageIndex: 14,
      rect: [80, 430, 530, 500],
      fontSize: 44,
      rotation: 0,
      color: [232, 0, 200],
      value: "UNSAVED NOTE",
    });
    // The same PDF.js serialization used by ViewerController.getBytes().
    const snapshot = await doc.saveDocument();
    assert(!source.includes(Buffer.from("UNSAVED NOTE")));
    const savedTask = openPdf(snapshot);
    try {
      const saved = await savedTask.promise;
      assert.equal(saved.numPages, pageCount);
      const annotations = await (await saved.getPage(15)).getAnnotations({ intent: "print" });
      assert(annotations.some(a => a.subtype === "FreeText" && a.contentsObj.str === "UNSAVED NOTE"));
    } finally {
      await savedTask.destroy();
    }
    await mkdir(printDir, { recursive: true });
    await writeFile(join(printDir, "snapshot.pdf"), snapshot);
  } finally {
    await task.destroy();
  }
}

async function verifyOutput() {
  const task = openPdf(await readFile(join(printDir, "printed.pdf")));
  try {
    const doc = await task.promise;
    assert.equal(doc.numPages, 2, "Only the two selected source pages should be spooled");
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 1 });
      const target = doc.canvasFactory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
      try {
        await page.render({ canvas: target.canvas, canvasContext: target.context, viewport }).promise;
        const { data } = target.context.getImageData(0, 0, target.canvas.width, target.canvas.height);
        let cyan = 0, orange = 0, magenta = 0;
        for (let j = 0; j < data.length; j += 4) {
          const [red, green, blue] = [data[j], data[j + 1], data[j + 2]];
          if (red < 85 && green > 110 && blue > 135) cyan++;
          if (red > 160 && green > 60 && green < 190 && blue < 85) orange++;
          if (red > 140 && green < 85 && blue > 115) magenta++;
        }
        console.log(`Printed page ${i}: cyan=${cyan}, orange=${orange}, annotation=${magenta}`);
        if (i === 1) {
          assert(cyan > 500 && orange < 20, "Output page 1 should be source page 15");
          assert(magenta > 100, "The unsaved FreeText annotation must be visible in print output");
        } else {
          assert(orange > 500 && cyan < 20, "Output page 2 should be landscape source page 190");
          assert(magenta < 20, "The annotation should appear only on its own page");
        }
      } finally {
        doc.canvasFactory.destroy(target);
      }
    }
  } finally {
    await task.destroy();
  }
}

switch (process.argv[2]) {
  case "prepare": await prepareSnapshot(); break;
  case "verify": await verifyOutput(); break;
  default: throw new Error("Choose prepare or verify");
}
