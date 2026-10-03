/*
 * Local Office export writer.
 *
 * The writer deliberately accepts only pixels that have already passed through
 * the image editor.  It does not fetch URLs, inspect the original screenshot,
 * or perform a privacy transformation.  Callers must pass a rendered image as
 * { kind: "edited", bytes/dataUrl, mimeType }.  This keeps export local and
 * makes it impossible for this module to silently fall back to the original
 * capture.
 */

const DOCX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";
const PPTX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml";
const REL_OFFICE_DOCUMENT = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument";
const REL_IMAGE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";
const REL_SLIDE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide";
const REL_SLIDE_LAYOUT = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout";
const REL_SLIDE_MASTER = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster";
const REL_THEME = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme";
const REL_HYPERLINK = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink";
const REL_PACKAGE = "http://schemas.openxmlformats.org/package/2006/relationships";
const REL_DOCX_NUMBERING = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering";

const MIME_EXTENSIONS = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpeg"]
]);

function text(value, fallback = "") {
  return typeof value === "string" ? value : value == null ? fallback : String(value);
}

function xml(value) {
  return text(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function xmlText(value) {
  return xml(text(value)).replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

function ensureTitle(value) {
  const result = text(value).trim();
  if (!result) throw new TypeError("Office export requires a title");
  return result;
}

function ensureSteps(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 200) {
    throw new TypeError("Office export requires one to 200 steps");
  }
  return value.map((step, index) => {
    if (!step || typeof step !== "object" || Array.isArray(step)) throw new TypeError(`Invalid step at index ${index}`);
    const instruction = text(step.instruction ?? step.body).trim();
    if (!instruction) throw new TypeError(`Step ${index + 1} requires body text`);
    const image = step.image ?? step.editedImage ?? null;
    return {
      number: Number.isInteger(step.number) && step.number > 0 ? step.number : index + 1,
      title: text(step.title).trim(),
      instruction,
      image: image ? normalizeEditedImage(image, index + 1) : null
    };
  });
}

function bytesFromDataUrl(value) {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=_-]+)$/u.exec(value);
  if (!match) throw new TypeError("Edited image dataUrl must be base64 encoded");
  const binary = typeof atob === "function"
    ? atob(match[2].replaceAll("-", "+").replaceAll("_", "/"))
    : Buffer.from(match[2], "base64").toString("binary");
  const result = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) result[index] = binary.charCodeAt(index);
  return { mimeType: match[1].toLowerCase(), bytes: result };
}

function bytesFromValue(value) {
  if (typeof value === "string") return bytesFromDataUrl(value);
  if (value instanceof Uint8Array) return { bytes: new Uint8Array(value), mimeType: "" };
  if (value instanceof ArrayBuffer) return { bytes: new Uint8Array(value.slice(0)), mimeType: "" };
  if (ArrayBuffer.isView(value)) return { bytes: new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)), mimeType: "" };
  throw new TypeError("Edited image must contain bytes or a dataUrl");
}

function readUint32(bytes, offset) {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function imageSize(bytes, mimeType) {
  if (mimeType === "image/png" && bytes.length >= 24 && readUint32(bytes, 0) === 0x89504e47) {
    return { width: readUint32(bytes, 16), height: readUint32(bytes, 20) };
  }
  if (mimeType === "image/jpeg" && bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1];
      offset += 2;
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const length = (bytes[offset] << 8) | bytes[offset + 1];
      if (length < 2 || offset + length > bytes.length) break;
      const sof = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf);
      if (sof && length >= 7) return { width: (bytes[offset + 5] << 8) | bytes[offset + 6], height: (bytes[offset + 3] << 8) | bytes[offset + 4] };
      offset += length;
    }
  }
  return null;
}

function normalizeEditedImage(value, stepNumber) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`Invalid edited image on step ${stepNumber}`);
  if (value.kind !== "edited" || value.original === true || value.source === "original") {
    throw new TypeError(`Step ${stepNumber} image must be an edited render`);
  }
  const provided = value.dataUrl ? bytesFromDataUrl(value.dataUrl) : bytesFromValue(value.bytes);
  const mimeType = text(value.mimeType || provided.mimeType).toLowerCase();
  if (!MIME_EXTENSIONS.has(mimeType)) throw new TypeError(`Step ${stepNumber} image must be PNG or JPEG`);
  if (!provided.bytes.length) throw new TypeError(`Step ${stepNumber} image is empty`);
  const parsed = imageSize(provided.bytes, mimeType);
  const width = Number(value.width || parsed?.width);
  const height = Number(value.height || parsed?.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new TypeError(`Step ${stepNumber} image dimensions are invalid`);
  return { kind: "edited", bytes: provided.bytes, mimeType, width, height };
}

export function normalizeOfficeManual(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Office export input must be an object");
  return {
    title: ensureTitle(value.title),
    description: text(value.description).trim(),
    steps: ensureSteps(value.steps)
  };
}

function u16(value) {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
}

function u32(value) {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]);
}

function joinBytes(...chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

function utf8(value) { return new TextEncoder().encode(value); }

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(entries) {
  const local = [];
  const central = [];
  let offset = 0;
  const date = new Date();
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  for (const entry of entries) {
    const name = utf8(entry.name);
    const body = entry.bytes instanceof Uint8Array ? entry.bytes : utf8(entry.bytes);
    const checksum = crc32(body);
    const header = joinBytes(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(dosTime), u16(dosDate), u32(checksum), u32(body.length), u32(body.length), u16(name.length), u16(0), name, body);
    local.push(header);
    central.push(joinBytes(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(dosTime), u16(dosDate), u32(checksum), u32(body.length), u32(body.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name));
    offset += header.length;
  }
  const localBytes = joinBytes(...local);
  const centralBytes = joinBytes(...central);
  return joinBytes(localBytes, centralBytes, u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(centralBytes.length), u32(localBytes.length), u16(0));
}

function relsXml(relationships) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${REL_PACKAGE}">${relationships.map((item) => `<Relationship Id="${xml(item.id)}" Type="${xml(item.type)}" Target="${xml(item.target)}"${item.targetMode ? ` TargetMode="${xml(item.targetMode)}"` : ""}/>`).join("")}</Relationships>`;
}

function paragraph(value, style = "Normal", extra = "") {
  const properties = extra || `<w:pPr><w:pStyle w:val="${xml(style)}"/></w:pPr>`;
  return `<w:p>${properties}<w:r><w:t xml:space="preserve">${xmlText(value)}</w:t></w:r></w:p>`;
}

function imageParagraph(image, relationshipId) {
  const maxWidth = 6.3 * 914400;
  const maxHeight = 7.6 * 914400;
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
  const cx = Math.max(1, Math.round(image.width * scale * 914400));
  const cy = Math.max(1, Math.round(image.height * scale * 914400));
  return `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${relationshipId.replace(/\D/gu, "") || "1"}" name="Edited step image"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${relationshipId.replace(/\D/gu, "") || "1"}" name="Edited step image"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${xml(relationshipId)}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

function docxContentTypes(images) {
  const defaults = `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${defaults}<Override PartName="/word/document.xml" ContentType="${DOCX_CONTENT_TYPE}"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;
}

function docxDocument(manual, imageIds) {
  const body = [paragraph(manual.title, "Title")];
  if (manual.description) body.push(paragraph(manual.description, "Subtitle"));
  manual.steps.forEach((step, index) => {
    body.push(paragraph(`手順 ${step.number}${step.title ? `：${step.title}` : ""}`, "Heading1", index === 0 ? "" : `<w:pPr><w:pStyle w:val="Heading1"/><w:pageBreakBefore/></w:pPr>`));
    body.push(paragraph(step.instruction));
    if (step.image) body.push(imageParagraph(step.image, imageIds[index]));
  });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${body.join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`;
}

function docxStyles() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:eastAsia="Yu Gothic"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Subtitle"/><w:rPr><w:b/><w:color w:val="087F7A"/><w:sz w:val="36"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:rPr><w:color w:val="52666A"/><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:keepNext/><w:rPr><w:b/><w:color w:val="126B5C"/><w:sz w:val="28"/></w:rPr></w:style></w:styles>`;
}

export function buildDocx(value) {
  const manual = normalizeOfficeManual(value);
  const entries = [];
  const imageRelationships = [];
  const imageIds = [];
  manual.steps.forEach((step, index) => {
    if (!step.image) { imageIds.push(""); return; }
    const id = `rIdImage${index + 1}`;
    const extension = MIME_EXTENSIONS.get(step.image.mimeType);
    imageRelationships.push({ id, type: REL_IMAGE, target: `media/image${index + 1}.${extension}` });
    entries.push({ name: `word/media/image${index + 1}.${extension}`, bytes: step.image.bytes });
    imageIds.push(id);
  });
  entries.unshift(
    { name: "[Content_Types].xml", bytes: utf8(docxContentTypes(manual.steps.filter((step) => step.image))) },
    { name: "_rels/.rels", bytes: utf8(relsXml([{ id: "rId1", type: REL_OFFICE_DOCUMENT, target: "word/document.xml" }])) },
    { name: "word/document.xml", bytes: utf8(docxDocument(manual, imageIds)) },
    { name: "word/styles.xml", bytes: utf8(docxStyles()) },
    { name: "word/_rels/document.xml.rels", bytes: utf8(relsXml(imageRelationships)) }
  );
  return zip(entries);
}

function pptTextShape(id, x, y, width, height, value, options = {}) {
  const fontSize = options.fontSize || 2200;
  const color = options.color || "162033";
  // normAutofit is required for long Japanese instructions: PowerPoint may
  // otherwise clip text at the fixed shape height instead of reducing the
  // font size to fit the allocated text box.
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Text ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${width}" cy="${height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square"><a:normAutofit/></a:bodyPr><a:lstStyle/><a:p><a:pPr algn="${options.align || "l"}"/><a:r><a:rPr lang="ja-JP" sz="${fontSize}" b="${options.bold ? 1 : 0}"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:rPr><a:t>${xmlText(value)}</a:t></a:r><a:endParaRPr lang="ja-JP"/></a:p></p:txBody></p:sp>`;
}

function pptImageShape(id, image, relationshipId) {
  const maxWidth = 6.55 * 914400;
  const maxHeight = 5.3 * 914400;
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
  const width = Math.max(1, Math.round(image.width * scale * 914400));
  const height = Math.max(1, Math.round(image.height * scale * 914400));
  const x = 12192000 - 600000 - width;
  const y = 1400000 + Math.round((5000000 - height) / 2);
  return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Edited step image"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${xml(relationshipId)}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${width}" cy="${height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
}

function pptSlide(manual, step, index, imageRelationshipId) {
  const title = `${manual.title}  —  手順 ${step.number}`;
  const description = manual.description ? `${manual.description}\n\n` : "";
  const shapes = [
    pptTextShape(2, 600000, 360000, 11200000, 600000, title, { fontSize: 2600, bold: true, color: "087F7A" }),
    pptTextShape(3, 650000, 1320000, 5000000, 720000, step.title || `手順 ${step.number}`, { fontSize: 3000, bold: true, color: "162033" }),
    pptTextShape(4, 650000, 2200000, 5000000, 3200000, description + step.instruction, { fontSize: 2000, color: "374151" })
  ];
  if (step.image) shapes.push(pptImageShape(5, step.image, imageRelationshipId));
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${shapes.join("")}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

function pptContentTypes(manual) {
  const slides = manual.steps.map((_, index) => `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("");
  const images = manual.steps.some((step) => step.image) ? `<Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${images}<Override PartName="/ppt/presentation.xml" ContentType="${PPTX_CONTENT_TYPE}"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${slides}</Types>`;
}

function pptPresentation(manual) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${manual.steps.map((_, index) => `<p:sldId id="${255 + index}" r:id="rId${index + 2}"/>`).join("")}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`;
}

function pptMaster() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld name="Office export"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`;
}

function pptLayout() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
}

function pptTheme() {
  const fills = `<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>`.repeat(3);
  const lines = `<a:ln w="9525" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:round/><a:headEnd type="none" w="med" len="med"/><a:tailEnd type="none" w="med" len="med"/></a:ln>`.repeat(3);
  const effects = `<a:effectStyle><a:effectLst/></a:effectStyle>`.repeat(3);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office export"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="162033"/></a:dk2><a:lt2><a:srgbClr val="F6F7F9"/></a:lt2><a:accent1><a:srgbClr val="087F7A"/></a:accent1><a:accent2><a:srgbClr val="C2410C"/></a:accent2><a:accent3><a:srgbClr val="2563EB"/></a:accent3><a:accent4><a:srgbClr val="7C3AED"/></a:accent4><a:accent5><a:srgbClr val="059669"/></a:accent5><a:accent6><a:srgbClr val="64748B"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Aptos Display"/><a:ea typeface="Yu Gothic"/><a:cs typeface="Aptos Display"/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/><a:ea typeface="Yu Gothic"/><a:cs typeface="Aptos"/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst>${fills}</a:fillStyleLst><a:lnStyleLst>${lines}</a:lnStyleLst><a:effectStyleLst>${effects}</a:effectStyleLst><a:bgFillStyleLst>${fills}</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
}

export function buildPptx(value) {
  const manual = normalizeOfficeManual(value);
  const entries = [
    { name: "[Content_Types].xml", bytes: utf8(pptContentTypes(manual)) },
    { name: "_rels/.rels", bytes: utf8(relsXml([{ id: "rId1", type: REL_OFFICE_DOCUMENT, target: "ppt/presentation.xml" }])) },
    { name: "ppt/presentation.xml", bytes: utf8(pptPresentation(manual)) },
    { name: "ppt/_rels/presentation.xml.rels", bytes: utf8(relsXml([{ id: "rId1", type: REL_SLIDE_MASTER, target: "slideMasters/slideMaster1.xml" }, ...manual.steps.map((_, index) => ({ id: `rId${index + 2}`, type: REL_SLIDE, target: `slides/slide${index + 1}.xml` }))])) },
    { name: "ppt/slideMasters/slideMaster1.xml", bytes: utf8(pptMaster()) },
    { name: "ppt/slideMasters/_rels/slideMaster1.xml.rels", bytes: utf8(relsXml([{ id: "rId1", type: REL_SLIDE_LAYOUT, target: "../slideLayouts/slideLayout1.xml" }, { id: "rId2", type: REL_THEME, target: "../theme/theme1.xml" }])) },
    { name: "ppt/slideLayouts/slideLayout1.xml", bytes: utf8(pptLayout()) },
    { name: "ppt/slideLayouts/_rels/slideLayout1.xml.rels", bytes: utf8(relsXml([{ id: "rId1", type: REL_SLIDE_MASTER, target: "../slideMasters/slideMaster1.xml" }])) },
    { name: "ppt/theme/theme1.xml", bytes: utf8(pptTheme()) }
  ];
  manual.steps.forEach((step, index) => {
    const relationships = [{ id: "rId1", type: REL_SLIDE_LAYOUT, target: "../slideLayouts/slideLayout1.xml" }];
    let imageRelationshipId = "";
    if (step.image) {
      imageRelationshipId = "rId2";
      const extension = MIME_EXTENSIONS.get(step.image.mimeType);
      relationships.push({ id: imageRelationshipId, type: REL_IMAGE, target: `../media/image${index + 1}.${extension}` });
      entries.push({ name: `ppt/media/image${index + 1}.${extension}`, bytes: step.image.bytes });
    }
    entries.push({ name: `ppt/slides/slide${index + 1}.xml`, bytes: utf8(pptSlide(manual, step, index, imageRelationshipId)) });
    entries.push({ name: `ppt/slides/_rels/slide${index + 1}.xml.rels`, bytes: utf8(relsXml(relationships)) });
  });
  return zip(entries);
}

export const OFFICE_EXPORT_MIME_TYPES = Object.freeze({
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation"
});
