import * as pdfjsLib from "pdfjs-dist";

// pdf.js sitt worker-script — samme pakke dere allerede har for tekst-lag-
// deteksjon. Peker til .mjs-bygget som følger med pdfjs-dist v4+.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

export function isPdfFile(file) {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
}

/**
 * Rendrer hver side i en PDF til et PNG-bilde og returnerer dem som vanlige
 * File-objekter — samme form som filene fra <input type="file"> ellers.
 *
 * VIKTIG: dette bruker pdf.js sin RENDERING (page.render), ikke
 * getOperatorList()/vektor-geometri-uttrekk. Rendering er den robuste,
 * veltestede delen av pdf.js uansett om kilde-PDF-en er en ekte
 * vektor-eksport eller et skannet rasterbilde limt inn i en PDF-wrapper —
 * begge tilfeller rendres korrekt til et bilde. Det var kun forsøket på å
 * trekke ut linjer/kurver direkte (getOperatorList) som var upålitelig for
 * disse tegningene, og den veien er ikke i bruk her.
 *
 * maxWidthPx er satt høyt med vilje: nedskalering til lav oppløsning var
 * den mest sannsynlige enkeltårsaken til at små dimensjonstall ble
 * uleselige tidligere i denne pipelinen.
 */
export async function convertPdfToImageFiles(pdfFile, { maxWidthPx = 2200 } = {}) {
  const buffer = await pdfFile.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const imageFiles = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(4, maxWidthPx / baseViewport.width);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 1.0));
    const baseName = (pdfFile.name || "tegning").replace(/\.pdf$/i, "");
    const suffix = pdf.numPages > 1 ? `_side${pageNum}` : "";
    imageFiles.push(new File([blob], `${baseName}${suffix}.png`, { type: "image/png" }));
  }

  return imageFiles;
}