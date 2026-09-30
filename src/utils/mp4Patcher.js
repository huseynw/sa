/**
 * mp4Patcher.js
 * In-browser binary MP4 patcher implementing the ParsMazi 120 FPS TikTok Studio Method.
 * 
 * Based directly on the reverse-engineered and verified ParsMazi engine (parsmazi.com):
 * 1. ZERO frame / duration cutting: Video samples, bitstream, resolution, and native
 *    framerate (60 FPS / 120 FPS) are 100% PRESERVED. The video track is completely untouched.
 * 2. Audio Table Inflation (The Core Method):
 *    - Clones the primary AAC audio track to a secondary Method track (highestTrackId + 1).
 *    - Injects dummy samples (METHOD_SAMPLE = [0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0x00])
 *      with a 10× sample multiplier into the cloned track's sample tables (stsz, stsc, stts).
 *    - Appends the dummy payload at the end of the container and maps chunk offsets (stco/co64).
 * 3. TikTok Pipeline Trigger (mvhd & edts manipulation):
 *    - Converts mvhd to Version 1 (64-bit) and sets duration to UNKNOWN (0xFFFFFFFFFFFFFFFF).
 *      This forces TikTok's server-side ingest classifier to derive timing from the sample
 *      tables instead of the container header, routing it to the top-tier 60/120 FPS pipeline.
 *    - Strips 'edts' (edit list) from video and timecode tracks, preserving it ONLY on the
 *      primary audio track. This ensures TikTok does not override sample table inference.
 * 4. FastStart Optimization:
 *    - Positions 'moov' before 'mdat' with zero-copy slicing and precise chunk offset adjustment.
 * 5. Metadata Injection:
 *    - Injects 'husevndownloader.netlify.app' encoder tag (©too) and method comment (©cmt)
 *      in standard Apple iTunes metadata format inside moov/udta.
 */

export const ENCODER_TAG = 'husevndownloader.netlify.app';
export const COMMENT_TAG = 'TikTok Method by husevndownloader.netlify.app';

const METHOD_SAMPLE = new Uint8Array([0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0x00]);
const MVHD_SURE_BILINMIYOR = 0xffffffffffffffffn;
const MULTIPLIER = 10;

// --- Binary DataView helpers ---

function readU32(bytes, offset) {
  if (offset < 0 || offset + 4 > bytes.length) {
    throw new Error('MP4 sahəsi fayl hüdudlarından kənardadır.');
  }
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, false);
}

function readI32(bytes, offset) {
  if (offset < 0 || offset + 4 > bytes.length) {
    throw new Error('MP4 sahəsi fayl hüdudlarından kənardadır.');
  }
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getInt32(0, false);
}

function readU64(bytes, offset) {
  if (offset < 0 || offset + 8 > bytes.length) {
    throw new Error('64-bit MP4 sahəsi oxuna bilmədi.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 8);
  const val = view.getBigUint64(0, false);
  return Number(val);
}

function writeU32(bytes, offset, value) {
  new DataView(bytes.buffer, bytes.byteOffset + offset, 4).setUint32(0, value >>> 0, false);
}

function writeI32(bytes, offset, value) {
  new DataView(bytes.buffer, bytes.byteOffset + offset, 4).setInt32(0, value | 0, false);
}

function writeU64(bytes, offset, value) {
  new DataView(bytes.buffer, bytes.byteOffset + offset, 8).setBigUint64(0, BigInt(value), false);
}

function readType(bytes, offset) {
  if (offset + 4 > bytes.length) return '';
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

function writeType(bytes, offset, type) {
  for (let i = 0; i < 4; i++) {
    bytes[offset + i] = type.charCodeAt(i) || 0x20;
  }
}

function concat(parts) {
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let cur = 0;
  for (const p of parts) {
    out.set(p, cur);
    cur += p.length;
  }
  return out;
}

function makeBox(type, payload) {
  const size = payload.length + 8;
  const out = new Uint8Array(size);
  writeU32(out, 0, size);
  writeType(out, 4, type);
  out.set(payload, 8);
  return out;
}

function makeFullBox(type, versionFlags, body) {
  return makeBox(type, concat([versionFlags, body]));
}

function isMethodTail(bytes, start, end) {
  const length = end - start;
  if (length <= 0 || length % METHOD_SAMPLE.length !== 0) return false;
  for (let offset = start; offset < end; offset += METHOD_SAMPLE.length) {
    for (let index = 0; index < METHOD_SAMPLE.length; index += 1) {
      if (bytes[offset + index] !== METHOD_SAMPLE[index]) return false;
    }
  }
  return true;
}

// --- Box Tree Parser ---

export function parseBoxes(bytes, start = 0, end = bytes.length, options = {}) {
  const boxes = [];
  const allowMethodTail = options.allowMethodTail === true;
  let cursor = start;

  while (cursor + 8 <= end) {
    const size32 = readU32(bytes, cursor);
    const type = readType(bytes, cursor + 4);
    let size = size32;
    let headerSize = 8;

    if (size32 === 1) {
      if (cursor + 16 > end) break;
      size = readU64(bytes, cursor + 8);
      headerSize = 16;
    } else if (size32 === 0) {
      size = end - cursor;
    }

    if (!type || size < headerSize || cursor + size > end) {
      if (allowMethodTail && isMethodTail(bytes, cursor, end)) {
        boxes.methodTailStart = cursor;
        boxes.methodTailCount = (end - cursor) / METHOD_SAMPLE.length;
        cursor = end;
        break;
      }
      break;
    }

    boxes.push({
      type,
      start: cursor,
      size,
      headerSize,
      end: cursor + size,
      payloadStart: cursor + headerSize,
      payloadEnd: cursor + size,
    });
    cursor += size;
  }

  const remaining = end - cursor;
  if (remaining > 0 && allowMethodTail && isMethodTail(bytes, cursor, end)) {
    boxes.methodTailStart = cursor;
    boxes.methodTailCount = remaining / METHOD_SAMPLE.length;
  }

  return boxes;
}

export function childrenOf(bytes, box) {
  return parseBoxes(bytes, box.payloadStart, box.payloadEnd);
}

export function childOf(bytes, box, type) {
  return childrenOf(bytes, box).find((child) => child.type === type) || null;
}

function rawBox(bytes, box) {
  return bytes.slice(box.start, box.end);
}

function versionFlags(bytes, box) {
  return bytes.slice(box.payloadStart, box.payloadStart + 4);
}

// --- Track & Media Parsers ---

function parseHandler(bytes, mdia) {
  const hdlr = childOf(bytes, mdia, 'hdlr');
  if (!hdlr || hdlr.payloadStart + 12 > hdlr.payloadEnd) return '';
  return readType(bytes, hdlr.payloadStart + 8);
}

function parseMediaHeader(bytes, box) {
  if (!box) return { timescale: 0, duration: 0, seconds: 0 };
  const version = bytes[box.payloadStart];
  let timescale;
  let duration;
  if (version === 1) {
    timescale = readU32(bytes, box.payloadStart + 20);
    duration = readU64(bytes, box.payloadStart + 24);
  } else {
    timescale = readU32(bytes, box.payloadStart + 12);
    duration = readU32(bytes, box.payloadStart + 16);
  }
  return {
    timescale,
    duration,
    seconds: timescale ? duration / timescale : 0,
  };
}

function parseTrackId(bytes, tkhd) {
  if (!tkhd) return 0;
  const version = bytes[tkhd.payloadStart];
  return readU32(bytes, tkhd.payloadStart + (version === 1 ? 20 : 12));
}

function parseStsdCodec(bytes, stbl) {
  const stsd = childOf(bytes, stbl, 'stsd');
  if (!stsd || stsd.payloadStart + 16 > stsd.payloadEnd) return 'unknown';
  const entryCount = readU32(bytes, stsd.payloadStart + 4);
  return entryCount > 0 ? readType(bytes, stsd.payloadStart + 12) : 'unknown';
}

function parseStsz(bytes, box) {
  if (!box || box.type !== 'stsz') {
    throw new Error('stsz sample cədvəli tapılmadı.');
  }
  const defaultSize = readU32(bytes, box.payloadStart + 4);
  const count = readU32(bytes, box.payloadStart + 8);
  const sizes = new Array(count);
  if (defaultSize !== 0) {
    sizes.fill(defaultSize);
  } else {
    const start = box.payloadStart + 12;
    for (let i = 0; i < count; i++) {
      sizes[i] = readU32(bytes, start + i * 4);
    }
  }
  return { defaultSize, count, sizes };
}

function parseStts(bytes, box) {
  if (!box) throw new Error('stts cədvəli tapılmadı.');
  const count = readU32(bytes, box.payloadStart + 4);
  const start = box.payloadStart + 8;
  const entries = [];
  for (let i = 0; i < count; i++) {
    entries.push({
      count: readU32(bytes, start + i * 8),
      delta: readU32(bytes, start + i * 8 + 4),
    });
  }
  return entries;
}

function parseStsc(bytes, box) {
  if (!box) throw new Error('stsc cədvəli tapılmadı.');
  const count = readU32(bytes, box.payloadStart + 4);
  const start = box.payloadStart + 8;
  const entries = [];
  for (let i = 0; i < count; i++) {
    entries.push({
      firstChunk: readU32(bytes, start + i * 12),
      samplesPerChunk: readU32(bytes, start + i * 12 + 4),
      descriptionIndex: readU32(bytes, start + i * 12 + 8),
    });
  }
  return entries;
}

function parseChunkOffsets(bytes, box) {
  if (!box || !['stco', 'co64'].includes(box.type)) {
    throw new Error('stco/co64 cədvəli tapılmadı.');
  }
  const count = readU32(bytes, box.payloadStart + 4);
  const itemSize = box.type === 'co64' ? 8 : 4;
  const start = box.payloadStart + 8;
  const offsets = new Array(count);
  for (let i = 0; i < count; i++) {
    offsets[i] =
      box.type === 'co64'
        ? readU64(bytes, start + i * 8)
        : readU32(bytes, start + i * 4);
  }
  return offsets;
}

function inspectTrack(bytes, trak, index) {
  const tkhd = childOf(bytes, trak, 'tkhd');
  const mdia = childOf(bytes, trak, 'mdia');
  if (!mdia) return null;
  const handler = parseHandler(bytes, mdia);
  const mdhd = childOf(bytes, mdia, 'mdhd');
  const media = parseMediaHeader(bytes, mdhd);
  const minf = childOf(bytes, mdia, 'minf');
  const stbl = minf ? childOf(bytes, minf, 'stbl') : null;
  const codec = stbl ? parseStsdCodec(bytes, stbl) : 'unknown';
  let width = 0;
  let height = 0;

  if (handler === 'vide' && tkhd && tkhd.end - 8 >= tkhd.payloadStart) {
    width = readU32(bytes, tkhd.end - 8) / 65536;
    height = readU32(bytes, tkhd.end - 4) / 65536;
  }

  let sampleCount = 0;
  let timingSeconds = 0;
  let fps = 0;
  if (stbl) {
    const stszBox = childOf(bytes, stbl, 'stsz');
    const sttsBox = childOf(bytes, stbl, 'stts');
    if (stszBox) sampleCount = readU32(bytes, stszBox.payloadStart + 8);
    if (sttsBox && media.timescale) {
      const entries = parseStts(bytes, sttsBox);
      const timingUnits = entries.reduce((sum, entry) => sum + entry.count * entry.delta, 0);
      timingSeconds = timingUnits / media.timescale;
      fps = timingSeconds ? sampleCount / timingSeconds : 0;
    }
  }

  return {
    index,
    trackId: parseTrackId(bytes, tkhd),
    trak,
    tkhd,
    mdia,
    mdhd,
    minf,
    stbl,
    handler,
    codec,
    width: Math.round(width),
    height: Math.round(height),
    timescale: media.timescale,
    duration: media.duration,
    seconds: media.seconds || timingSeconds,
    sampleCount,
    fps,
  };
}

export function inspectMp4(bytes) {
  const top = parseBoxes(bytes, 0, bytes.length, { allowMethodTail: true });
  const methodTailCount = top.methodTailCount || 0;
  const moov = top.find((b) => b.type === 'moov') || null;
  const mdats = top.filter((b) => b.type === 'mdat');
  const ftyp = top.find((b) => b.type === 'ftyp') || null;

  if (!moov || mdats.length === 0) {
    throw new Error('Etibarsız MP4 faylı: moov və ya mdat tapılmadı.');
  }

  const tracks = [];
  const trakBoxes = childrenOf(bytes, moov).filter((b) => b.type === 'trak');
  trakBoxes.forEach((trak, index) => {
    const info = inspectTrack(bytes, trak, index);
    if (info) tracks.push(info);
  });

  const videoTrack = tracks.find((t) => t.handler === 'vide') || null;
  const audioTracks = tracks.filter((t) => t.handler === 'soun');
  const audioTrack = audioTracks.find((t) => t.codec === 'mp4a') || audioTracks[0] || null;

  const duration = videoTrack?.seconds || 0;
  const bitrate = duration ? (bytes.length * 8) / duration : 0;
  const fastStart = Boolean(moov && mdats[0] && moov.start < mdats[0].start);

  return {
    bytes,
    top,
    ftyp,
    moov,
    mdat: mdats[0],
    tracks,
    videoTrack,
    audioTracks,
    audioTrack,
    fastStart,
    duration,
    bitrate,
    methodTailCount,
  };
}

// --- ParsMazi Method Builders ---

function makeStsz(bytes, original, sampleSizes, injectedCount) {
  const total = sampleSizes.length + injectedCount;
  const body = new Uint8Array(8 + total * 4);
  writeU32(body, 0, 0); // uniform size = 0
  writeU32(body, 4, total);
  let cursor = 8;
  for (const size of sampleSizes) {
    writeU32(body, cursor, size);
    cursor += 4;
  }
  for (let i = 0; i < injectedCount; i++) {
    writeU32(body, cursor, METHOD_SAMPLE.length);
    cursor += 4;
  }
  return makeFullBox('stsz', versionFlags(bytes, original), body);
}

function makeStsc(bytes, original, originalChunkCount, injectedCount, descriptionIndex) {
  const entries = parseStsc(bytes, original).map((e) => ({ ...e }));
  if (injectedCount > 0) {
    entries.push({
      firstChunk: originalChunkCount + 1,
      samplesPerChunk: injectedCount,
      descriptionIndex: descriptionIndex || 1,
    });
  }
  const body = new Uint8Array(4 + entries.length * 12);
  writeU32(body, 0, entries.length);
  entries.forEach((entry, i) => {
    writeU32(body, 4 + i * 12, entry.firstChunk);
    writeU32(body, 8 + i * 12, entry.samplesPerChunk);
    writeU32(body, 12 + i * 12, entry.descriptionIndex);
  });
  return makeFullBox('stsc', versionFlags(bytes, original), body);
}

function makeStts(bytes, original, injectedCount) {
  const entries = parseStts(bytes, original).map((e) => ({ ...e }));
  if (injectedCount > 0) {
    entries.push({ count: injectedCount, delta: 1 });
  }
  const body = new Uint8Array(4 + entries.length * 8);
  writeU32(body, 0, entries.length);
  entries.forEach((entry, i) => {
    writeU32(body, 4 + i * 8, entry.count);
    writeU32(body, 8 + i * 8, entry.delta);
  });
  return makeFullBox('stts', versionFlags(bytes, original), body);
}

function makeChunkOffsetBox(bytes, original, offsets, placeholder = false) {
  const is64 = original.type === 'co64';
  const itemSize = is64 ? 8 : 4;
  const body = new Uint8Array(4 + offsets.length * itemSize);
  writeU32(body, 0, offsets.length);
  offsets.forEach((offset, index) => {
    const value = placeholder ? 0 : offset;
    if (is64) writeU64(body, 4 + index * 8, value);
    else writeU32(body, 4 + index * 4, value);
  });
  return makeFullBox(original.type, versionFlags(bytes, original), body);
}

function mapMediaOffset(offset, context) {
  const { oldMdatPayloadStart, oldMdatPayloadEnd, newMdatPayloadStart, placeholder } = context;
  if (placeholder) return 0;
  if (offset < oldMdatPayloadStart || offset >= oldMdatPayloadEnd) {
    return offset + (newMdatPayloadStart - oldMdatPayloadStart);
  }
  return newMdatPayloadStart + (offset - oldMdatPayloadStart);
}

function patchTrackStbl(bytes, stbl, context) {
  const children = childrenOf(bytes, stbl);
  const parts = [];
  for (const child of children) {
    if (['stco', 'co64'].includes(child.type)) {
      const offsets = parseChunkOffsets(bytes, child).map((offset) =>
        mapMediaOffset(offset, context)
      );
      parts.push(makeChunkOffsetBox(bytes, child, offsets, context.placeholder));
    } else {
      parts.push(rawBox(bytes, child));
    }
  }
  return makeBox('stbl', concat(parts));
}

function replaceChildBox(bytes, parent, targetStart, replacement) {
  const parts = [];
  for (const child of childrenOf(bytes, parent)) {
    parts.push(child.start === targetStart ? replacement : rawBox(bytes, child));
  }
  return makeBox(parent.type, concat(parts));
}

function rebuildTrack(bytes, track, context, keepEdts) {
  if (!track.stbl || !track.minf || !track.mdia) {
    throw new Error('Track sample strukturu natamamdır.');
  }
  const stbl = patchTrackStbl(bytes, track.stbl, context);
  const minf = replaceChildBox(bytes, track.minf, track.stbl.start, stbl);
  const mdia = replaceChildBox(bytes, track.mdia, track.minf.start, minf);
  // edts (edit list) is removed from video and timecode tracks, preserved ONLY on primary audio!
  const trackParts = childrenOf(bytes, track.trak)
    .filter((child) => keepEdts || child.type !== 'edts')
    .map((child) => (child.start === track.mdia.start ? mdia : rawBox(bytes, child)));
  return makeBox('trak', concat(trackParts));
}

function rebuildAudioPatchStbl(bytes, track, plan, context) {
  const children = childrenOf(bytes, track.stbl);
  const originalChunkBox =
    children.find((b) => b.type === 'stco') || children.find((b) => b.type === 'co64');
  const offsets = plan.chunkOffsets.map((offset) => mapMediaOffset(offset, context));
  const dummyOffset = context.placeholder
    ? 0
    : context.newMdatPayloadStart + context.oldMdatPayloadLength;
  offsets.push(dummyOffset);

  const replacements = new Map();
  replacements.set(
    plan.stszBox.start,
    makeStsz(bytes, plan.stszBox, plan.sampleSizes, plan.injectedCount)
  );
  replacements.set(
    plan.stscBox.start,
    makeStsc(
      bytes,
      plan.stscBox,
      plan.chunkOffsets.length,
      plan.injectedCount,
      plan.descriptionIndex
    )
  );
  replacements.set(
    plan.sttsBox.start,
    makeStts(bytes, plan.sttsBox, plan.injectedCount)
  );
  replacements.set(
    originalChunkBox.start,
    makeChunkOffsetBox(bytes, originalChunkBox, offsets, context.placeholder)
  );

  const parts = [];
  let chunkWritten = false;
  for (const child of children) {
    if (['stco', 'co64'].includes(child.type)) {
      if (!chunkWritten) {
        parts.push(replacements.get(originalChunkBox.start));
        chunkWritten = true;
      }
      continue;
    }
    parts.push(replacements.get(child.start) || rawBox(bytes, child));
  }
  return makeBox('stbl', concat(parts));
}

function makeTrackHeaderWithId(bytes, tkhd, trackId) {
  const payload = bytes.slice(tkhd.payloadStart, tkhd.payloadEnd);
  const version = payload[0];
  writeU32(payload, version === 1 ? 20 : 12, trackId);
  return makeBox('tkhd', payload);
}

function makeMediaHeaderWithDuration(bytes, mdhd, duration) {
  const payload = bytes.slice(mdhd.payloadStart, mdhd.payloadEnd);
  const version = payload[0];
  if (version === 1) {
    writeU64(payload, 24, duration);
  } else {
    writeU32(payload, 16, duration);
  }
  return makeBox('mdhd', payload);
}

function makeMovieHeaderWithNextTrackId(bytes, mvhd, nextTrackId) {
  const src = bytes.slice(mvhd.payloadStart, mvhd.payloadEnd);
  const ver = src[0];
  const tailStart = ver === 1 ? 4 + 28 : 4 + 16;
  const tail = src.slice(tailStart);

  const payload = new Uint8Array(4 + 28 + tail.length);
  payload[0] = 1; // Convert to Version 1 (64-bit)
  payload[1] = src[1];
  payload[2] = src[2];
  payload[3] = src[3];

  const creation = ver === 1 ? readU64(src, 4) : readU32(src, 4);
  const mod = ver === 1 ? readU64(src, 12) : readU32(src, 8);
  const timescale = ver === 1 ? readU32(src, 20) : readU32(src, 12);

  writeU64(payload, 4, creation);
  writeU64(payload, 12, mod);
  writeU32(payload, 20, timescale);
  // Setting duration to 0xFFFFFFFFFFFFFFFF (UNKNOWN) triggers TikTok's sample table inference pipeline!
  writeU64(payload, 24, MVHD_SURE_BILINMIYOR);

  payload.set(tail, 4 + 28);
  writeU32(payload, payload.length - 4, nextTrackId);
  return makeBox('mvhd', payload);
}

function rebuildMethodAudioTrack(bytes, track, plan, context) {
  const stbl = rebuildAudioPatchStbl(bytes, track, plan, context);
  const minf = replaceChildBox(bytes, track.minf, track.stbl.start, stbl);
  const mdhd = makeMediaHeaderWithDuration(bytes, track.mdhd, track.duration);
  const mdiaParts = childrenOf(bytes, track.mdia).map((child) => {
    if (child.start === track.mdhd.start) return mdhd;
    if (child.start === track.minf.start) return minf;
    return rawBox(bytes, child);
  });
  const mdia = makeBox('mdia', concat(mdiaParts));
  const tkhd = makeTrackHeaderWithId(bytes, track.tkhd, plan.methodTrackId);
  const trackParts = childrenOf(bytes, track.trak)
    .filter((child) => child.type !== 'edts')
    .map((child) => {
      if (child.start === track.tkhd.start) return tkhd;
      if (child.start === track.mdia.start) return mdia;
      return rawBox(bytes, child);
    });
  return makeBox('trak', concat(trackParts));
}

/**
 * Builds Apple iTunes standard metadata tag box (udta -> meta -> ilst -> ©too, ©cmt)
 */
export function buildUdtaBox(encoder = ENCODER_TAG, comment = COMMENT_TAG) {
  const encBytes = new TextEncoder().encode(encoder);
  const cmtBytes = new TextEncoder().encode(comment);

  const makeTagItem = (name, textBytes) => {
    const dataBoxLen = 8 + 8 + textBytes.length;
    const dataBox = new Uint8Array(dataBoxLen);
    const dv = new DataView(dataBox.buffer);
    dv.setUint32(0, dataBoxLen);
    dataBox.set([0x64, 0x61, 0x74, 0x61], 4);
    dv.setUint32(8, 1);
    dv.setUint32(12, 0);
    dataBox.set(textBytes, 16);

    const itemBoxLen = 8 + dataBoxLen;
    const itemBox = new Uint8Array(itemBoxLen);
    const idv = new DataView(itemBox.buffer);
    idv.setUint32(0, itemBoxLen);
    for (let i = 0; i < 4; i++) itemBox[4 + i] = name.charCodeAt(i);
    itemBox.set(dataBox, 8);
    return itemBox;
  };

  const tooBox = makeTagItem('©too', encBytes);
  const cmtBox = makeTagItem('©cmt', cmtBytes);

  const ilstLen = 8 + tooBox.length + cmtBox.length;
  const ilst = new Uint8Array(ilstLen);
  new DataView(ilst.buffer).setUint32(0, ilstLen);
  ilst.set([0x69, 0x6c, 0x73, 0x74], 4);
  ilst.set(tooBox, 8);
  ilst.set(cmtBox, 8 + tooBox.length);

  const hdlrLen = 33;
  const hdlr = new Uint8Array(hdlrLen);
  new DataView(hdlr.buffer).setUint32(0, hdlrLen);
  hdlr.set([0x68, 0x64, 0x6c, 0x72], 4);
  hdlr.set([0x6d, 0x64, 0x69, 0x72], 12);
  hdlr.set([0x61, 0x70, 0x70, 0x6c], 16);

  const metaContentLen = 4 + hdlr.length + ilst.length;
  const metaBoxLen = 8 + metaContentLen;
  const meta = new Uint8Array(metaBoxLen);
  new DataView(meta.buffer).setUint32(0, metaBoxLen);
  meta.set([0x6d, 0x65, 0x74, 0x61], 4);
  meta.set(hdlr, 12);
  meta.set(ilst, 12 + hdlr.length);

  const udtaLen = 8 + meta.length;
  const udta = new Uint8Array(udtaLen);
  new DataView(udta.buffer).setUint32(0, udtaLen);
  udta.set([0x75, 0x64, 0x74, 0x61], 4);
  udta.set(meta, 8);
  return udta;
}

/**
 * Creates a synthetic silent AAC audio track to ensure the ParsMazi method
 * can be applied even if the uploaded video has no audio track.
 */
function createSyntheticAudioTrack(bytes, videoTrack, trackId) {
  const durationSec = Math.max(1, videoTrack.seconds || 10);
  const sampleRate = 48000;
  const samplesPerFrame = 1024;
  const totalFrames = Math.max(1, Math.round((durationSec * sampleRate) / samplesPerFrame));
  const trackDuration = totalFrames * samplesPerFrame;

  // tkhd (trackId, volume 1.0 = 0x0100)
  const tkhdPayload = new Uint8Array(84);
  writeU32(tkhdPayload, 12, trackId);
  writeU32(tkhdPayload, 20, Math.round(durationSec * 1000));
  new DataView(tkhdPayload.buffer).setUint16(36, 0x0100);
  const tkhd = makeBox('tkhd', tkhdPayload);

  // mdhd
  const mdhdPayload = new Uint8Array(24);
  writeU32(mdhdPayload, 12, sampleRate);
  writeU32(mdhdPayload, 16, trackDuration);
  const mdhd = makeBox('mdhd', mdhdPayload);

  // hdlr (soun)
  const hdlrPayload = new Uint8Array(25);
  hdlrPayload.set([0x73, 0x6f, 0x75, 0x6e], 8); // 'soun'
  const hdlr = makeBox('hdlr', hdlrPayload);

  // smhd
  const smhd = makeFullBox('smhd', new Uint8Array(4), new Uint8Array(4));

  // dinf -> dref
  const drefEntry = makeFullBox('url ', new Uint8Array([0, 0, 0, 1]), new Uint8Array(0));
  const dref = makeFullBox('dref', new Uint8Array(4), concat([new Uint8Array([0, 0, 0, 1]), drefEntry]));
  const dinf = makeBox('dinf', dref);

  // stsd with mp4a
  const mp4aPayload = new Uint8Array(28);
  writeU32(mp4aPayload, 16, 2); // 2 channels
  writeU32(mp4aPayload, 20, 16); // 16-bit
  writeU32(mp4aPayload, 24, sampleRate << 16);
  const mp4a = makeBox('mp4a', mp4aPayload);
  const stsd = makeFullBox('stsd', new Uint8Array(4), concat([new Uint8Array([0, 0, 0, 1]), mp4a]));

  // stts
  const stts = makeFullBox(
    'stts',
    new Uint8Array(4),
    concat([new Uint8Array([0, 0, 0, 1]), (() => {
      const b = new Uint8Array(8);
      writeU32(b, 0, totalFrames);
      writeU32(b, 4, samplesPerFrame);
      return b;
    })()])
  );

  // stsc
  const stsc = makeFullBox(
    'stsc',
    new Uint8Array(4),
    concat([new Uint8Array([0, 0, 0, 1]), (() => {
      const b = new Uint8Array(12);
      writeU32(b, 0, 1);
      writeU32(b, 4, totalFrames);
      writeU32(b, 8, 1);
      return b;
    })()])
  );

  // stsz (dummy sample size 8)
  const stsz = makeFullBox(
    'stsz',
    new Uint8Array(4),
    concat([(() => {
      const b = new Uint8Array(8);
      writeU32(b, 0, 8); // uniform 8 bytes
      writeU32(b, 4, totalFrames);
      return b;
    })()])
  );

  // stco
  const stco = makeFullBox(
    'stco',
    new Uint8Array(4),
    concat([new Uint8Array([0, 0, 0, 1]), new Uint8Array(4)])
  );

  const stbl = makeBox('stbl', concat([stsd, stts, stsc, stsz, stco]));
  const minf = makeBox('minf', concat([smhd, dinf, stbl]));
  const mdia = makeBox('mdia', concat([mdhd, hdlr, minf]));
  const trak = makeBox('trak', concat([tkhd, mdia]));
  const trakBoxes = parseBoxes(trak, 0, trak.length);
  const trackInfo = inspectTrack(trak, trakBoxes[0], 1);
  trackInfo.ownBytes = trak;
  return trackInfo;
}

function makeAudioPatchPlan(bytes, analysis, multiplier = MULTIPLIER) {
  const track = analysis.audioTrack;
  const b = track.ownBytes || bytes;
  const children = childrenOf(b, track.stbl);
  const stszBox = children.find((b) => b.type === 'stsz');
  const stscBox = children.find((b) => b.type === 'stsc');
  const sttsBox = children.find((b) => b.type === 'stts');
  const chunkBox = children.find((b) => b.type === 'stco') || children.find((b) => b.type === 'co64');

  const stsz = parseStsz(b, stszBox);
  const stsc = parseStsc(b, stscBox);
  const chunks = parseChunkOffsets(b, chunkBox);
  const originalCount = stsz.count;
  const injectedCount = originalCount * (multiplier - 1);
  const declaredCount = originalCount + injectedCount;
  const descriptionIndex = stsc[0]?.descriptionIndex || 1;

  const highestTrackId = analysis.tracks.reduce(
    (highest, t) => Math.max(highest, t.trackId || 0),
    0
  );
  const methodTrackId = highestTrackId + 1;

  return {
    trackIndex: track.index,
    sourceTrackId: track.trackId,
    methodTrackId,
    nextTrackId: methodTrackId + 1,
    stszBox,
    stscBox,
    sttsBox,
    chunkBox,
    sampleSizes: stsz.sizes,
    chunkOffsets: chunks,
    originalCount,
    injectedCount,
    declaredCount,
    descriptionIndex,
  };
}

function rebuildMoov(bytes, analysis, context, audioPlan, options) {
  const replacements = new Map();
  for (const track of analysis.tracks) {
    const b = track.ownBytes || bytes;
    const keepEdts = track.trak.start === analysis.audioTrack?.trak?.start;
    replacements.set(track.trak.start, rebuildTrack(b, track, context, keepEdts));
  }

  let methodTrack = null;
  if (audioPlan && analysis.audioTrack) {
    const b = analysis.audioTrack.ownBytes || bytes;
    methodTrack = rebuildMethodAudioTrack(b, analysis.audioTrack, audioPlan, context);
  }

  const moovChildren = childrenOf(bytes, analysis.moov);
  const primaryAudioStart = analysis.audioTrack?.trak?.start;
  const primaryAudioIndex = primaryAudioStart
    ? moovChildren.findIndex((c) => c.start === primaryAudioStart)
    : -1;

  const parts = [];
  moovChildren.forEach((child, index) => {
    if (child.type === 'mvhd') {
      const nextId = audioPlan ? audioPlan.nextTrackId : 3;
      parts.push(makeMovieHeaderWithNextTrackId(bytes, child, nextId));
    } else if (child.type !== 'udta') {
      parts.push(replacements.get(child.start) || rawBox(bytes, child));
    }
    // Insert cloned Method track immediately after primary audio track!
    if (methodTrack && index === primaryAudioIndex) {
      parts.push(methodTrack);
    }
  });

  // If methodTrack couldn't be placed after primary audio, append it
  if (methodTrack && primaryAudioIndex === -1) {
    parts.push(methodTrack);
  }

  // Inject standard Apple iTunes udta tag box with husevndownloader.netlify.app
  const newUdta = buildUdtaBox(
    options.encoder || ENCODER_TAG,
    options.comment || COMMENT_TAG
  );
  parts.push(newUdta);

  return makeBox('moov', concat(parts));
}

// --- Public API ---

/**
 * Probes basic metadata from an MP4 file or blob.
 */
export async function probeMp4Metadata(fileOrBlob) {
  try {
    const slice = fileOrBlob.slice(0, Math.min(fileOrBlob.size, 1024 * 1024 * 4));
    const ab = await slice.arrayBuffer();
    const bytes = new Uint8Array(ab);
    const analysis = inspectMp4(bytes);
    return {
      width: analysis.videoTrack?.width || 0,
      height: analysis.videoTrack?.height || 0,
      fps: analysis.videoTrack?.fps ? Math.round(analysis.videoTrack.fps * 100) / 100 : 0,
      duration: Math.round(analysis.duration * 10) / 10,
      bitrate: analysis.bitrate ? Math.round((analysis.bitrate / 1_000_000) * 10) / 10 : 0,
      isFastStart: analysis.fastStart,
      hasAudio: analysis.audioTracks.length > 0,
      isMethodApplied: analysis.methodTailCount > 0,
      size: fileOrBlob.size,
    };
  } catch {
    return null;
  }
}

/**
 * Main patch function.
 * Implements the verified ParsMazi 120 FPS TikTok Studio Method.
 * 
 * Preserves 100% video quality, 0 frame drops, 0 video truncations,
 * maintains native 60/120 FPS, and inflates audio tables to trigger
 * TikTok's top-tier encoding pipeline.
 */
export async function patchMp4(fileOrBlob, options = {}, onProgress) {
  onProgress && onProgress({ percent: 10, stage: 'Fayl və MP4 strukturu oxunur...' });

  const buffer = await fileOrBlob.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  onProgress && onProgress({ percent: 25, stage: 'Video və audio izləri analiz edilir...' });
  const analysis = inspectMp4(bytes);

  if (!analysis.videoTrack) {
    throw new Error('Videoda video izi (vide) tapılmadı.');
  }

  // If file doesn't have an audio track, synthesize a silent AAC track
  if (!analysis.audioTrack) {
    const highestId = analysis.tracks.reduce((max, t) => Math.max(max, t.trackId || 0), 0);
    analysis.audioTrack = createSyntheticAudioTrack(bytes, analysis.videoTrack, highestId + 1);
    analysis.tracks.push(analysis.audioTrack);
  }

  const preset = options.preset || 'parsmazi'; // 'parsmazi' (default) | 'faststart'
  let audioPlan = null;

  if (preset === 'parsmazi') {
    onProgress && onProgress({ percent: 45, stage: 'ParsMazi 120 FPS Method cədvəli qurulur...' });
    audioPlan = makeAudioPatchPlan(bytes, analysis, MULTIPLIER);
  }

  const oldMdatPayloadStart = analysis.mdat.payloadStart;
  const oldMdatPayloadEnd = analysis.mdat.payloadEnd;
  const oldMdatPayloadLength = oldMdatPayloadEnd - oldMdatPayloadStart;
  const prefix = analysis.ftyp ? rawBox(bytes, analysis.ftyp) : new Uint8Array(0);

  onProgress && onProgress({ percent: 60, stage: 'FastStart moov konteyneri hesablanır...' });

  // Pass 1: Measure exact draftMoov size with placeholder offsets
  const placeholderContext = {
    placeholder: true,
    oldMdatPayloadStart,
    oldMdatPayloadEnd,
    oldMdatPayloadLength,
    newMdatPayloadStart: 0,
  };
  const draftMoov = rebuildMoov(bytes, analysis, placeholderContext, audioPlan, options);

  // Pass 2: Exact offset calculation
  const newMdatPayloadStart = prefix.length + draftMoov.length + 8;
  const finalContext = {
    placeholder: false,
    oldMdatPayloadStart,
    oldMdatPayloadEnd,
    oldMdatPayloadLength,
    newMdatPayloadStart,
  };

  onProgress && onProgress({ percent: 75, stage: 'Ofsetlər və zaman cədvəlləri dəqiqləşdirilir...' });
  const moov = rebuildMoov(bytes, analysis, finalContext, audioPlan, options);

  if (moov.length !== draftMoov.length) {
    throw new Error('Daxili xəta: Konteyner ölçüsü dəyişdi.');
  }

  // Prepare dummy payload for ParsMazi method
  let dummyPayload = new Uint8Array(0);
  if (audioPlan && audioPlan.injectedCount > 0) {
    dummyPayload = new Uint8Array(audioPlan.injectedCount * METHOD_SAMPLE.length);
    for (let i = 0; i < audioPlan.injectedCount; i++) {
      dummyPayload.set(METHOD_SAMPLE, i * METHOD_SAMPLE.length);
    }
  }

  onProgress && onProgress({ percent: 90, stage: 'Yeni ParsMazi Method MP4 faylı qurulur...' });

  // Assembly: [prefix/ftyp] -> [moov] -> [mdat header: 8b] -> [original mdat payload] -> [dummy payload]
  const mdatSize = 8 + oldMdatPayloadLength;
  const totalSize = prefix.length + moov.length + mdatSize + dummyPayload.length;
  const output = new Uint8Array(totalSize);

  let cursor = 0;
  output.set(prefix, cursor);
  cursor += prefix.length;

  output.set(moov, cursor);
  cursor += moov.length;

  writeU32(output, cursor, mdatSize);
  writeType(output, cursor + 4, 'mdat');
  cursor += 8;

  output.set(bytes.subarray(oldMdatPayloadStart, oldMdatPayloadEnd), cursor);
  cursor += oldMdatPayloadLength;

  if (dummyPayload.length > 0) {
    output.set(dummyPayload, cursor);
  }

  onProgress && onProgress({ percent: 100, stage: 'Tamamlandı!' });

  const outBlob = new Blob([output], { type: 'video/mp4' });
  const originalName = fileOrBlob.name || 'video';
  const cleanBaseName = originalName.replace(/\.[^/.]+$/, '');
  const outName = `${cleanBaseName}_parsmazi_husevndownloader.mp4`;

  return {
    blob: outBlob,
    name: outName,
    size: outBlob.size,
    oldSize: fileOrBlob.size,
    encoder: ENCODER_TAG,
    method: COMMENT_TAG,
    fps: analysis.videoTrack.fps,
    duration: analysis.duration,
  };
}
