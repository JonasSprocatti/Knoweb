// Verifica o leitor de Word/PowerPoint: node --experimental-strip-types scripts/office-check.mjs
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { docxToMarkdown, pptxToMarkdown } from "../src/lib/server/office.ts";

/** Zip mínimo (deflate) só para o teste. */
function zip(files) {
  const locals = [], central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const n = Buffer.from(name), data = deflateRawSync(Buffer.from(text));
    const l = Buffer.alloc(30); l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(8, 8); l.writeUInt32LE(data.length, 18); l.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(8, 10); c.writeUInt32LE(data.length, 20); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42);
    locals.push(l, n, data); central.push(c, n);
    offset += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(central), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(central.length / 2, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, e]);
}

const doc = `<w:document><w:body>
<w:p><w:pPr><w:pStyle w:val="Ttulo1"/></w:pPr><w:r><w:t>Metas &amp; prazos</w:t></w:r></w:p>
<w:p><w:r><w:t xml:space="preserve">Texto </w:t></w:r><w:r><w:t>normal</w:t></w:r></w:p>
<w:p><w:pPr><w:numPr/></w:pPr><w:r><w:t>item</w:t></w:r></w:p>
<w:tbl><w:tr><w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>B|C</w:t></w:r></w:p></w:tc></w:tr>
<w:tr><w:tc><w:p><w:r><w:t>1</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>2</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
<w:p/></w:body></w:document>`;
assert.equal(
  docxToMarkdown(zip({ "word/document.xml": doc })),
  "## Metas & prazos\n\nTexto normal\n\n- item\n\n| A | B\\|C |\n| --- | --- |\n| 1 | 2 |",
);

const slide = (t) => `<p:sld><a:p><a:r><a:t>${t}</a:t></a:r></a:p><a:p><a:r><a:t>um</a:t></a:r><a:br/><a:r><a:t>dois</a:t></a:r></a:p></p:sld>`;
const deck = zip({ "ppt/slides/slide10.xml": slide("Dez"), "ppt/slides/slide2.xml": slide("Dois"), "ppt/slides/slide1.xml": slide("Um") });
assert.equal(pptxToMarkdown(deck).split("\n\n").filter((l) => !l.startsWith("##") && l.length < 5).join(","), "Um,Dois,Dez");
assert.match(pptxToMarkdown(deck), /^## Slide 1\n\nUm\n\num\ndois/);

assert.throws(() => docxToMarkdown(Buffer.from("não é zip")));
console.log("office ok");
