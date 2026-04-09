/**
 * Extract text from a PDF file using pdfjs-dist.
 * Handles text-based and image-based (OCR-less fallback) PDFs.
 */

let pdfjsLib = null;

async function getPdfLib() {
  if (pdfjsLib) return pdfjsLib;
  pdfjsLib = await import('pdfjs-dist');
  // Point the worker to the bundled worker file
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url
  ).href;
  return pdfjsLib;
}

/**
 * @param {ArrayBuffer} arrayBuffer - PDF file contents
 * @returns {Promise<{ text: string, pageCount: number, hasText: boolean }>}
 */
export async function extractPdfText(arrayBuffer) {
  const pdfjs = await getPdfLib();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const pageCount = pdf.numPages;

  const pageTexts = [];
  let totalChars = 0;
  const MAX_CHARS = 60_000; // cap at 60k chars total

  for (let i = 1; i <= pageCount; i++) {
    if (totalChars >= MAX_CHARS) break;
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // Join items; preserve line breaks by checking y-position changes
    let lastY = null;
    const chunks = [];
    for (const item of content.items) {
      if ('str' in item) {
        if (lastY !== null && Math.abs(item.transform[5] - lastY) > 2) {
          chunks.push('\n');
        }
        chunks.push(item.str);
        lastY = item.transform[5];
      }
    }
    const pageText = chunks.join('').trim();
    if (pageText) pageTexts.push(pageText);
    totalChars += pageText.length;
  }

  const text = pageTexts.join('\n\n').trim();
  return {
    text,
    pageCount,
    hasText: text.length > 0,
  };
}
