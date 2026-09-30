/**
 * mp4Patcher.js
 * In-browser binary MP4 patcher for TikTok Studio High Quality Upload Method.
 * 
 * Features:
 * 1. FastStart Optimization: Moves 'moov' atom to the beginning of the file (before 'mdat'),
 *    accurately recalculating all 32-bit (stco) and 64-bit (co64) chunk offsets.
 * 2. Metadata Injection:
 *    - Encoder (©too): 'husevndownloader.netlify.app'
 *    - Comment (©cmt): 'Patched by husevndownloader.netlify.app'
 *    - Custom UDTA atom: 'Patched by husevndownloader.netlify.app'
 * 3. Timescale / itsscale modes:
 *    - 60 FPS (x2 timescale scale)
 *    - 120 FPS (x6 timescale scale)
 *    - Anti-compression clean (lossless FastStart + metadata tagging)
 * 4. Zero-copy chunk slicing using Blob.slice() for instant processing (0 MB RAM overhead).
 */

export const ENCODER_TAG = 'husevndownloader.netlify.app';
export const COMMENT_TAG = 'Patched by husevndownloader.netlify.app';

/**
 * Scans top-level MP4 boxes from a File or Blob without loading large media into RAM.
 */
export async function parseTopLevelBoxes(fileOrBlob) {
  const boxes = [];
  let offset = 0;
  const totalLength = fileOrBlob.size;

  while (offset + 8 <= totalLength) {
    const slice = fileOrBlob.slice(offset, offset + 16);
    const ab = await slice.arrayBuffer();
    if (ab.byteLength < 8) break;

    const dv = new DataView(ab);
    const size = dv.getUint32(0);
    const type = String.fromCharCode(
      dv.getUint8(4),
      dv.getUint8(5),
      dv.getUint8(6),
      dv.getUint8(7)
    );

    let headerSize = 8;
    let boxSize = size;

    if (size === 1) {
      if (ab.byteLength < 16) break;
      const high = dv.getUint32(8);
      const low = dv.getUint32(12);
      boxSize = high * 4294967296 + low;
      headerSize = 16;
    } else if (size === 0) {
      boxSize = totalLength - offset;
    }

    if (boxSize < headerSize) break;

    boxes.push({
      type,
      offset,
      size: boxSize,
      headerSize,
      end: offset + boxSize,
    });

    offset += boxSize;
  }

  return boxes;
}

/**
 * Constructs a binary 'udta' atom with iTunes metadata and raw signature.
 */
function buildUdtaBox(encoder = ENCODER_TAG, comment = COMMENT_TAG) {
  const enc = new TextEncoder();

  function makeDataBox(text) {
    const textBytes = enc.encode(text);
    const dataSize = 16 + textBytes.length;
    const buf = new Uint8Array(dataSize);
    const dv = new DataView(buf.buffer);
    dv.setUint32(0, dataSize);
    buf.set([0x64, 0x61, 0x74, 0x61], 4); // 'data'
    dv.setUint32(8, 1); // type 1 = UTF-8 text
    dv.setUint32(12, 0); // locale = 0
    buf.set(textBytes, 16);
    return buf;
  }

  function makeIlstItem(fourCC, text) {
    const dataBox = makeDataBox(text);
    const itemSize = 8 + dataBox.length;
    const buf = new Uint8Array(itemSize);
    const dv = new DataView(buf.buffer);
    dv.setUint32(0, itemSize);
    for (let i = 0; i < 4; i++) {
      buf[4 + i] = fourCC.charCodeAt(i);
    }
    buf.set(dataBox, 8);
    return buf;
  }

  const itemToo = makeIlstItem('\xA9too', encoder);
  const itemCmt = makeIlstItem('\xA9cmt', comment);

  const ilstLen = 8 + itemToo.length + itemCmt.length;
  const ilst = new Uint8Array(ilstLen);
  const ilstDv = new DataView(ilst.buffer);
  ilstDv.setUint32(0, ilstLen);
  ilst.set([0x69, 0x6c, 0x73, 0x74], 4); // 'ilst'
  ilst.set(itemToo, 8);
  ilst.set(itemCmt, 8 + itemToo.length);

  // hdlr box (33 bytes)
  const hdlr = new Uint8Array(33);
  const hdlrDv = new DataView(hdlr.buffer);
  hdlrDv.setUint32(0, 33);
  hdlr.set([0x68, 0x64, 0x6c, 0x72], 4); // 'hdlr'
  hdlr.set([0x6d, 0x64, 0x69, 0x72], 16); // 'mdir'
  hdlr.set([0x61, 0x70, 0x70, 0x6c], 20); // 'appl'

  // meta box (FullBox: size 4, 'meta' 4, ver/flags 4, child boxes)
  const metaLen = 12 + hdlr.length + ilst.length;
  const meta = new Uint8Array(metaLen);
  const metaDv = new DataView(meta.buffer);
  metaDv.setUint32(0, metaLen);
  meta.set([0x6d, 0x65, 0x74, 0x61], 4); // 'meta'
  metaDv.setUint32(8, 0); // version & flags = 0
  meta.set(hdlr, 12);
  meta.set(ilst, 12 + hdlr.length);

  // Raw signature box for instant string scanners
  const sigTextBytes = enc.encode(comment);
  const sigLen = 8 + sigTextBytes.length;
  const sig = new Uint8Array(sigLen);
  const sigDv = new DataView(sig.buffer);
  sigDv.setUint32(0, sigLen);
  sig.set([0x68, 0x75, 0x73, 0x65], 4); // 'huse'
  sig.set(sigTextBytes, 8);

  // udta box
  const udtaLen = 8 + meta.length + sig.length;
  const udta = new Uint8Array(udtaLen);
  const udtaDv = new DataView(udta.buffer);
  udtaDv.setUint32(0, udtaLen);
  udta.set([0x75, 0x64, 0x74, 0x61], 4); // 'udta'
  udta.set(meta, 8);
  udta.set(sig, 8 + meta.length);

  return udta;
}

/**
 * Searches and parses inner boxes within a Uint8Array slice.
 */
function parseInnerBoxes(u8, start = 0, end = u8.length) {
  const boxes = [];
  let off = start;
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);

  while (off + 8 <= end) {
    const sz = dv.getUint32(off);
    const nm = String.fromCharCode(
      u8[off + 4],
      u8[off + 5],
      u8[off + 6],
      u8[off + 7]
    );

    let hSz = 8;
    let bSz = sz;
    if (sz === 1) {
      if (off + 16 > end) break;
      const hi = dv.getUint32(off + 8);
      const lo = dv.getUint32(off + 12);
      bSz = hi * 4294967296 + lo;
      hSz = 16;
    } else if (sz === 0) {
      bSz = end - off;
    }

    if (bSz < hSz) break;
    const bEnd = Math.min(off + bSz, end);
    boxes.push({
      name: nm,
      offset: off,
      size: bSz,
      headerSize: hSz,
      contentStart: off + hSz,
      boxEnd: bEnd,
    });
    off = bEnd;
  }
  return boxes;
}

/**
 * Adjusts 32-bit (stco) and 64-bit (co64) chunk offsets inside a moov Uint8Array.
 */
function shiftChunkOffsets(moovU8, shift) {
  if (shift === 0) return;
  const dv = new DataView(moovU8.buffer, moovU8.byteOffset, moovU8.byteLength);

  for (let i = 0; i <= moovU8.length - 8; i++) {
    // Check for 'stco'
    if (
      moovU8[i + 4] === 0x73 &&
      moovU8[i + 5] === 0x74 &&
      moovU8[i + 6] === 0x63 &&
      moovU8[i + 7] === 0x6f
    ) {
      const boxSize = dv.getUint32(i);
      if (i + boxSize <= moovU8.length && boxSize >= 16) {
        const count = dv.getUint32(i + 12);
        for (let e = 0; e < count; e++) {
          const entryOff = i + 16 + e * 4;
          if (entryOff + 4 <= moovU8.length) {
            const current = dv.getUint32(entryOff);
            dv.setUint32(entryOff, current + shift);
          }
        }
      }
    }

    // Check for 'co64'
    if (
      moovU8[i + 4] === 0x63 &&
      moovU8[i + 5] === 0x6f &&
      moovU8[i + 6] === 0x36 &&
      moovU8[i + 7] === 0x34
    ) {
      const boxSize = dv.getUint32(i);
      if (i + boxSize <= moovU8.length && boxSize >= 16) {
        const count = dv.getUint32(i + 12);
        for (let e = 0; e < count; e++) {
          const entryOff = i + 16 + e * 8;
          if (entryOff + 8 <= moovU8.length) {
            const hi = dv.getUint32(entryOff);
            const lo = dv.getUint32(entryOff + 4);
            const current = hi * 4294967296 + lo;
            const updated = current + shift;
            dv.setUint32(entryOff, Math.floor(updated / 4294967296));
            dv.setUint32(entryOff + 4, updated >>> 0);
          }
        }
      }
    }
  }
}

/**
 * Modifies timescale / sample deltas in moov if 60fps/120fps preset is requested.
 */
function applyTimescaleScale(moovU8, scaleFactor) {
  if (!scaleFactor || scaleFactor <= 1) return;
  const dv = new DataView(moovU8.buffer, moovU8.byteOffset, moovU8.byteLength);

  // Scan for 'stts' (time to sample box) in video track
  for (let i = 0; i <= moovU8.length - 8; i++) {
    if (
      moovU8[i + 4] === 0x73 &&
      moovU8[i + 5] === 0x74 &&
      moovU8[i + 6] === 0x74 &&
      moovU8[i + 7] === 0x73
    ) {
      const boxSize = dv.getUint32(i);
      if (i + boxSize <= moovU8.length && boxSize >= 16) {
        const count = dv.getUint32(i + 12);
        for (let e = 0; e < count; e++) {
          const deltaOff = i + 16 + e * 8 + 4;
          if (deltaOff + 4 <= moovU8.length) {
            const delta = dv.getUint32(deltaOff);
            dv.setUint32(deltaOff, Math.round(delta * scaleFactor));
          }
        }
      }
    }
  }
}

/**
 * Main patch function.
 * Takes an input File or Blob, patches metadata, performs FastStart, and returns a new Blob.
 */
export async function patchMp4(fileOrBlob, options = {}, onProgress) {
  onProgress && onProgress({ percent: 10, stage: 'Fayl analiz edilir...' });

  const boxes = await parseTopLevelBoxes(fileOrBlob);
  const ftypBox = boxes.find(b => b.type === 'ftyp');
  const moovBox = boxes.find(b => b.type === 'moov');
  const mdatBox = boxes.find(b => b.type === 'mdat');

  if (!moovBox || !mdatBox) {
    throw new Error('Etibarsız MP4 faylı: moov və ya mdat tapılmadı.');
  }

  onProgress && onProgress({ percent: 30, stage: 'Metadata hazırlanır...' });

  // Read the original moov box
  const moovSlice = fileOrBlob.slice(moovBox.offset, moovBox.offset + moovBox.size);
  const moovAb = await moovSlice.arrayBuffer();
  let moovU8 = new Uint8Array(moovAb);

  // Remove existing udta box if present
  const innerBoxes = parseInnerBoxes(moovU8, 8, moovU8.length);
  const existingUdta = innerBoxes.find(b => b.name === 'udta');

  if (existingUdta) {
    const before = moovU8.subarray(0, existingUdta.offset);
    const after = moovU8.subarray(existingUdta.boxEnd);
    const cleaned = new Uint8Array(before.length + after.length);
    cleaned.set(before, 0);
    cleaned.set(after, before.length);
    moovU8 = cleaned;
  }

  // Build brand-new UDTA with husevndownloader.netlify.app tags
  const newUdta = buildUdtaBox(
    options.encoder || ENCODER_TAG,
    options.comment || COMMENT_TAG
  );

  // Append new UDTA into moov
  const mergedMoov = new Uint8Array(moovU8.length + newUdta.length);
  mergedMoov.set(moovU8, 0);
  mergedMoov.set(newUdta, moovU8.length);

  // Update moov total size in header
  const moovDv = new DataView(mergedMoov.buffer);
  moovDv.setUint32(0, mergedMoov.length);

  onProgress && onProgress({ percent: 55, stage: 'FPS və vaxt miqyası tənzimlənir...' });

  // Apply timescale scale if 60fps (scale: 2) or 120fps (scale: 6) mode
  const preset = options.preset || 'anticompress';
  if (preset === '60fps') {
    applyTimescaleScale(mergedMoov, 2);
  } else if (preset === '120fps') {
    applyTimescaleScale(mergedMoov, 6);
  }

  onProgress && onProgress({ percent: 75, stage: 'FastStart kadr ofsetləri hesablanır...' });

  // FastStart:
  // We want the output to be: [ftyp] -> [moov] -> [mdat]
  const isMoovAfterMdat = moovBox.offset > mdatBox.offset;
  let offsetShift = 0;

  if (isMoovAfterMdat) {
    // moov is moving from the end of the file to before mdat!
    // The new mdat starts at: (ftypBox ? ftypBox.size : 0) + mergedMoov.length
    // The old mdat started at: mdatBox.offset
    const oldMdatStart = mdatBox.offset;
    const newMdatStart = (ftypBox ? ftypBox.size : 0) + mergedMoov.length;
    offsetShift = newMdatStart - oldMdatStart;
  } else {
    // moov was already before mdat, but its size changed!
    const oldMoovSize = moovBox.size;
    const newMoovSize = mergedMoov.length;
    offsetShift = newMoovSize - oldMoovSize;
  }

  shiftChunkOffsets(mergedMoov, offsetShift);

  onProgress && onProgress({ percent: 90, stage: 'Yeni video fayl tərtib edilir...' });

  // Build the final blob
  const chunks = [];
  if (ftypBox) {
    chunks.push(fileOrBlob.slice(ftypBox.offset, ftypBox.offset + ftypBox.size));
  }
  chunks.push(mergedMoov);

  // mdat slice
  chunks.push(fileOrBlob.slice(mdatBox.offset, mdatBox.offset + mdatBox.size));

  // Any other trailing boxes if present (excluding old moov)
  for (const b of boxes) {
    if (b.type !== 'ftyp' && b.type !== 'moov' && b.type !== 'mdat' && b.type !== 'free') {
      chunks.push(fileOrBlob.slice(b.offset, b.offset + b.size));
    }
  }

  const outBlob = new Blob(chunks, { type: 'video/mp4' });

  onProgress && onProgress({ percent: 100, stage: 'Hazırdır!' });

  const originalName = fileOrBlob.name || 'video';
  const cleanBaseName = originalName.replace(/\.[^/.]+$/, '');
  const outName = `${cleanBaseName}_husevndownloader.mp4`;

  return {
    blob: outBlob,
    name: outName,
    size: outBlob.size,
    oldSize: fileOrBlob.size,
    preset,
    encoder: ENCODER_TAG,
    method: COMMENT_TAG,
  };
}
