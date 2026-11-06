/**
 * Test helper: builds a minimal, valid PDF (Helvetica, one text line per row)
 * so PDF extraction can be tested without binary fixtures. ASCII text only.
 * Long lines wrap at word boundaries, as they would on a printed page.
 */
function wrap(line: string, width: number): string[] {
  if (line.length <= width) return [line];
  const out: string[] = [];
  let cur = "";
  for (const word of line.split(" ")) {
    if (cur && cur.length + 1 + word.length > width) {
      out.push(cur);
      cur = word;
    } else cur = cur ? `${cur} ${word}` : word;
  }
  if (cur) out.push(cur);
  return out;
}

export function makeTestPdf(pages: string[][], opts: { wrapAt?: number } = {}): Uint8Array<ArrayBuffer> {
  const width = opts.wrapAt ?? 90;
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const objects: { id: number; body: string }[] = [
    { id: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
    { id: 3, body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>" },
  ];
  const pageIds: number[] = [];
  let next = 4;
  for (const lines of pages) {
    const pageId = next++;
    const contentId = next++;
    pageIds.push(pageId);
    let stream = "BT /F1 10 Tf 13 TL 54 760 Td\n";
    for (const line of lines.flatMap((l) => wrap(l, width))) stream += `(${esc(line)}) Tj T*\n`;
    stream += "ET";
    objects.push({
      id: pageId,
      body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`,
    });
    objects.push({ id: contentId, body: `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream` });
  }
  objects.push({ id: 2, body: `<< /Type /Pages /Kids [${pageIds.map((i) => `${i} 0 R`).join(" ")}] /Count ${pageIds.length} >>` });
  objects.sort((a, b) => a.id - b.id);

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const o of objects) {
    offsets[o.id] = out.length;
    out += `${o.id} 0 obj\n${o.body}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) out += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(new TextEncoder().encode(out));
}
