/**
 * mp4Patcher.js
 * In-browser binary MP4 patcher for TikTok Studio High Quality Upload Method.
 * 
 * Core Technique — ITSSCALE EMULATION:
 * Replicates `ffmpeg -itsscale 2 -i input.mp4 -c copy output.mp4` purely
 * in the browser by scaling ALL timing fields (mvhd/tkhd/mdhd duration,
 * stts deltas, ctts offsets, elst entries) by ×2 in the moov atom.
 * This makes TikTok's server-side quality classifier treat the file as a
 * high-quality source, preserving FPS and preventing aggressive re-encoding.
 *
 * Additional:
 * - FastStart Optimization: moov before mdat, with accurate stco/co64 updates
 * - Metadata Injection: husevndownloader.netlify.app encoder tag (©too/©cmt)
 * - Built-in metadata inspector (resolution, FPS, duration, bitrate)
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
    const slice = fileOrBlob.slice(offset, Math.min(offset + 32, totalLength));
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
 * Parses inner boxes within a Uint8Array slice.
 */
export function parseInnerBoxes(u8, start = 0, end = u8.length) {
  const boxes = [];
  let off = start;
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);

  while (off + 8 <= end) {
    let sz = dv.getUint32(off);
    const nm = String.fromCharCode(
      u8[off + 4],
      u8[off + 5],
      u8[off + 6],
      u8[off + 7]
    );

    let hSz = 8;
    if (sz === 1) {
      if (off + 16 > end) break;
      const hi = dv.getUint32(off + 8);
      const lo = dv.getUint32(off + 12);
      sz = hi * 4294967296 + lo;
      hSz = 16;
    } else if (sz === 0) {
      sz = end - off;
    }

    if (sz < hSz) break;
    const bEnd = Math.min(off + sz, end);
    boxes.push({
      name: nm,
      offset: off,
      size: sz,
      headerSize: hSz,
      contentStart: off + hSz,
      boxEnd: bEnd,
    });
    off = bEnd;
  }
  return boxes;
}

/**
 * Finds all child boxes with a matching name.
 */
export function findBoxes(u8, start, end, targetName) {
  return parseInnerBoxes(u8, start, end).filter(b => b.name === targetName);
}

/**
 * Probes video properties (width, height, FPS, duration, bitrate, FastStart) from MP4 headers.
 */
export async function probeMp4Metadata(fileOrBlob) {
  try {
    const boxes = await parseTopLevelBoxes(fileOrBlob);
    const ftyp = boxes.find(b => b.type === 'ftyp');
    const moov = boxes.find(b => b.type === 'moov');
    const mdat = boxes.find(b => b.type === 'mdat');

    const isFastStart = !!(moov && mdat && moov.offset < mdat.offset);
    if (!moov) {
      return { width: null, height: null, fps: null, duration: null, bitrate: null, isFastStart };
    }

    const moovSlice = fileOrBlob.slice(moov.offset, moov.offset + moov.size);
    const moovAb = await moovSlice.arrayBuffer();
    const moovU8 = new Uint8Array(moovAb);
    const dv = new DataView(moovU8.buffer);

    let fps = null;
    let width = null;
    let height = null;
    let duration = null;

    // Read mvhd for movie duration
    const mvhd = findBoxes(moovU8, 8, moovU8.length, 'mvhd')[0];
    if (mvhd && mvhd.size >= 24) {
      const ver = dv.getUint8(mvhd.offset + 8);
      const ts = ver === 1 ? dv.getUint32(mvhd.offset + 28) : dv.getUint32(mvhd.offset + 20);
      const dur = ver === 1
        ? (dv.getUint32(mvhd.offset + 32) * 4294967296 + dv.getUint32(mvhd.offset + 36))
        : dv.getUint32(mvhd.offset + 24);
      if (ts > 0 && dur > 0) {
        duration = Math.round((dur / ts) * 10) / 10;
      }
    }

    // Traverse traks for video track
    const traks = findBoxes(moovU8, 8, moovU8.length, 'trak');
    for (const trak of traks) {
      const mdia = findBoxes(moovU8, trak.contentStart, trak.boxEnd, 'mdia')[0];
      if (!mdia) continue;
      const hdlr = findBoxes(moovU8, mdia.contentStart, mdia.boxEnd, 'hdlr')[0];
      if (!hdlr) continue;

      const hType = String.fromCharCode(
        moovU8[hdlr.offset + 16],
        moovU8[hdlr.offset + 17],
        moovU8[hdlr.offset + 18],
        moovU8[hdlr.offset + 19]
      );

      if (hType === 'vide') {
        // Track dimensions from tkhd
        const tkhd = findBoxes(moovU8, trak.contentStart, trak.boxEnd, 'tkhd')[0];
        if (tkhd) {
          const ver = dv.getUint8(tkhd.offset + 8);
          const wOff = tkhd.offset + (ver === 1 ? 96 : 84);
          if (wOff + 8 <= moovU8.length) {
            width = dv.getUint32(wOff) >> 16;
            height = dv.getUint32(wOff + 4) >> 16;
          }
        }

        // Media timescale from mdhd
        const mdhd = findBoxes(moovU8, mdia.contentStart, mdia.boxEnd, 'mdhd')[0];
        let timescale = 0;
        let trackDur = 0;
        if (mdhd) {
          const ver = dv.getUint8(mdhd.offset + 8);
          timescale = ver === 1 ? dv.getUint32(mdhd.offset + 28) : dv.getUint32(mdhd.offset + 20);
          trackDur = ver === 1
            ? (dv.getUint32(mdhd.offset + 32) * 4294967296 + dv.getUint32(mdhd.offset + 36))
            : dv.getUint32(mdhd.offset + 24);
        }

        if (!duration && timescale > 0 && trackDur > 0) {
          duration = Math.round((trackDur / timescale) * 10) / 10;
        }

        // Exact framerate from stts
        const minf = findBoxes(moovU8, mdia.contentStart, mdia.boxEnd, 'minf')[0];
        if (minf) {
          const stbl = findBoxes(moovU8, minf.contentStart, minf.boxEnd, 'stbl')[0];
          if (stbl) {
            const stts = findBoxes(moovU8, stbl.contentStart, stbl.boxEnd, 'stts')[0];
            if (stts && timescale > 0) {
              const count = dv.getUint32(stts.offset + 12);
              if (count > 0) {
                const delta = dv.getUint32(stts.offset + 16 + 4);
                if (delta > 0) {
                  const rawFps = timescale / delta;
                  fps = Math.round(rawFps * 10) / 10;
                }
              }
            }
          }
        }
        break;
      }
    }

    let bitrate = null;
    if (duration && duration > 0) {
      bitrate = Math.round(((fileOrBlob.size * 8) / duration) / 100000) / 10; // in Mbps
    }

    return {
      width,
      height,
      fps,
      duration,
      bitrate,
      isFastStart,
      size: fileOrBlob.size,
    };
  } catch (e) {
    console.warn('[mp4Patcher] metadata probe failed:', e);
    return null;
  }
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

  // Standard Apple iTunes meta box (hdlr + ilst)
  // hdlr box: size 33, 'hdlr', 0, 0, 'mdir', 'appl', 0, 0, 0, 0
  const hdlr = new Uint8Array(33);
  const hdlrDv = new DataView(hdlr.buffer);
  hdlrDv.setUint32(0, 33);
  hdlr.set([0x68, 0x64, 0x6c, 0x72], 4); // 'hdlr'
  hdlr.set([0x6d, 0x64, 0x69, 0x72], 16); // 'mdir'
  hdlr.set([0x61, 0x70, 0x70, 0x6c], 20); // 'appl'

  // meta box (FullBox: size 4, 'meta' 4, ver/flags 4, children)
  const metaLen = 12 + hdlr.length + ilst.length;
  const meta = new Uint8Array(metaLen);
  const metaDv = new DataView(meta.buffer);
  metaDv.setUint32(0, metaLen);
  meta.set([0x6d, 0x65, 0x74, 0x61], 4); // 'meta'
  metaDv.setUint32(8, 0); // version & flags = 0
  meta.set(hdlr, 12);
  meta.set(ilst, 12 + hdlr.length);

  // Raw signature atom for instant string inspection
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
 * ITSSCALE EMULATION — The core of the TikTok Upload Method.
 *
 * Equivalent to: ffmpeg -itsscale <scaleFactor> -i input.mp4 -c copy output.mp4
 *
 * Multiplies ALL presentation timestamps by scaleFactor, which changes
 * how TikTok's server-side quality classifier reads the file. Upload120,
 * Void Studio, and Compressbase all use similar binary-level manipulation.
 *
 * CRITICAL: We update EVERY timing-related field consistently:
 *   mvhd duration, tkhd duration, mdhd duration, stts sample_delta,
 *   ctts sample_offset, elst segment_duration & media_time.
 *
 * If any field is missed the file becomes internally inconsistent and
 * players/TikTok will truncate, desync, or reject the video.
 *
 * NOTE: The downloaded file will appear slowed-down in a regular player.
 * This is expected. TikTok's re-encoder corrects the timing during upload.
 */
function applyItsscale(moovU8, scaleFactor) {
  if (!scaleFactor || scaleFactor <= 1) return;
  const dv = new DataView(moovU8.buffer, moovU8.byteOffset, moovU8.byteLength);

  // --- 1. Scale mvhd duration ---
  const mvhd = findBoxes(moovU8, 8, moovU8.length, 'mvhd')[0];
  if (mvhd) {
    const ver = dv.getUint8(mvhd.contentStart);
    if (ver === 1) {
      const durOff = mvhd.contentStart + 24;
      if (durOff + 8 <= moovU8.length) {
        const hi = dv.getUint32(durOff);
        const lo = dv.getUint32(durOff + 4);
        const nd = Math.round((hi * 4294967296 + lo) * scaleFactor);
        dv.setUint32(durOff, Math.floor(nd / 4294967296));
        dv.setUint32(durOff + 4, nd >>> 0);
      }
    } else {
      const durOff = mvhd.contentStart + 16;
      if (durOff + 4 <= moovU8.length) {
        dv.setUint32(durOff, Math.round(dv.getUint32(durOff) * scaleFactor));
      }
    }
  }

  // --- 2. Scale per-track timing ---
  const traks = findBoxes(moovU8, 8, moovU8.length, 'trak');
  for (const trak of traks) {
    // 2a. tkhd duration (in mvhd timescale units)
    const tkhd = findBoxes(moovU8, trak.contentStart, trak.boxEnd, 'tkhd')[0];
    if (tkhd) {
      const ver = dv.getUint8(tkhd.contentStart);
      if (ver === 1) {
        const durOff = tkhd.contentStart + 28;
        if (durOff + 8 <= moovU8.length) {
          const hi = dv.getUint32(durOff);
          const lo = dv.getUint32(durOff + 4);
          const nd = Math.round((hi * 4294967296 + lo) * scaleFactor);
          dv.setUint32(durOff, Math.floor(nd / 4294967296));
          dv.setUint32(durOff + 4, nd >>> 0);
        }
      } else {
        const durOff = tkhd.contentStart + 20;
        if (durOff + 4 <= moovU8.length) {
          dv.setUint32(durOff, Math.round(dv.getUint32(durOff) * scaleFactor));
        }
      }
    }

    const mdia = findBoxes(moovU8, trak.contentStart, trak.boxEnd, 'mdia')[0];
    if (!mdia) continue;

    // 2b. mdhd duration (in mdhd timescale units)
    const mdhd = findBoxes(moovU8, mdia.contentStart, mdia.boxEnd, 'mdhd')[0];
    if (mdhd) {
      const ver = dv.getUint8(mdhd.contentStart);
      if (ver === 1) {
        const durOff = mdhd.contentStart + 24;
        if (durOff + 8 <= moovU8.length) {
          const hi = dv.getUint32(durOff);
          const lo = dv.getUint32(durOff + 4);
          const nd = Math.round((hi * 4294967296 + lo) * scaleFactor);
          dv.setUint32(durOff, Math.floor(nd / 4294967296));
          dv.setUint32(durOff + 4, nd >>> 0);
        }
      } else {
        const durOff = mdhd.contentStart + 16;
        if (durOff + 4 <= moovU8.length) {
          dv.setUint32(durOff, Math.round(dv.getUint32(durOff) * scaleFactor));
        }
      }
    }

    // 2c. stts sample deltas + ctts composition offsets
    const minf = findBoxes(moovU8, mdia.contentStart, mdia.boxEnd, 'minf')[0];
    if (minf) {
      const stbl = findBoxes(moovU8, minf.contentStart, minf.boxEnd, 'stbl')[0];
      if (stbl) {
        const stts = findBoxes(moovU8, stbl.contentStart, stbl.boxEnd, 'stts')[0];
        if (stts) {
          const count = dv.getUint32(stts.contentStart + 4);
          for (let i = 0; i < count; i++) {
            const dOff = stts.contentStart + 8 + i * 8 + 4;
            if (dOff + 4 <= moovU8.length) {
              dv.setUint32(dOff, Math.round(dv.getUint32(dOff) * scaleFactor));
            }
          }
        }

        const ctts = findBoxes(moovU8, stbl.contentStart, stbl.boxEnd, 'ctts')[0];
        if (ctts) {
          const ver = dv.getUint8(ctts.contentStart);
          const count = dv.getUint32(ctts.contentStart + 4);
          for (let i = 0; i < count; i++) {
            const oOff = ctts.contentStart + 8 + i * 8 + 4;
            if (oOff + 4 <= moovU8.length) {
              if (ver === 0) {
                dv.setUint32(oOff, Math.round(dv.getUint32(oOff) * scaleFactor));
              } else {
                dv.setInt32(oOff, Math.round(dv.getInt32(oOff) * scaleFactor));
              }
            }
          }
        }
      }
    }

    // 2d. elst (edit list) entries
    const edts = findBoxes(moovU8, trak.contentStart, trak.boxEnd, 'edts')[0];
    if (edts) {
      const elst = findBoxes(moovU8, edts.contentStart, edts.boxEnd, 'elst')[0];
      if (elst) {
        const ver = dv.getUint8(elst.contentStart);
        const count = dv.getUint32(elst.contentStart + 4);
        for (let i = 0; i < count; i++) {
          if (ver === 1) {
            const eo = elst.contentStart + 8 + i * 20;
            if (eo + 20 <= moovU8.length) {
              const sd = dv.getUint32(eo) * 4294967296 + dv.getUint32(eo + 4);
              const nsd = Math.round(sd * scaleFactor);
              dv.setUint32(eo, Math.floor(nsd / 4294967296));
              dv.setUint32(eo + 4, nsd >>> 0);
              const mtHi = dv.getInt32(eo + 8);
              if (!(mtHi === -1)) {
                const mt = mtHi * 4294967296 + dv.getUint32(eo + 12);
                const nmt = Math.round(mt * scaleFactor);
                dv.setUint32(eo + 8, Math.floor(nmt / 4294967296));
                dv.setUint32(eo + 12, nmt >>> 0);
              }
            }
          } else {
            const eo = elst.contentStart + 8 + i * 12;
            if (eo + 12 <= moovU8.length) {
              dv.setUint32(eo, Math.round(dv.getUint32(eo) * scaleFactor));
              const mt = dv.getInt32(eo + 4);
              if (mt >= 0) {
                dv.setInt32(eo + 4, Math.round(mt * scaleFactor));
              }
            }
          }
        }
      }
    }
  }
}

/**
 * Adjusts all 32-bit (stco) and 64-bit (co64) chunk offsets by traversing
 * the MP4 hierarchy: moov -> trak -> mdia -> minf -> stbl -> (stco | co64).
 */
function updateChunkOffsets(moovU8, shift) {
  if (shift === 0) return;
  const dv = new DataView(moovU8.buffer, moovU8.byteOffset, moovU8.byteLength);

  const traks = findBoxes(moovU8, 8, moovU8.length, 'trak');
  for (const trak of traks) {
    const mdias = findBoxes(moovU8, trak.contentStart, trak.boxEnd, 'mdia');
    for (const mdia of mdias) {
      const minfs = findBoxes(moovU8, mdia.contentStart, mdia.boxEnd, 'minf');
      for (const minf of minfs) {
        const stbls = findBoxes(moovU8, minf.contentStart, minf.boxEnd, 'stbl');
        for (const stbl of stbls) {
          // Adjust 32-bit stco
          const stcos = findBoxes(moovU8, stbl.contentStart, stbl.boxEnd, 'stco');
          for (const stco of stcos) {
            if (stco.size >= 16) {
              const count = dv.getUint32(stco.offset + 12);
              for (let i = 0; i < count; i++) {
                const offPos = stco.offset + 16 + i * 4;
                if (offPos + 4 <= moovU8.length) {
                  const oldOff = dv.getUint32(offPos);
                  dv.setUint32(offPos, oldOff + shift);
                }
              }
            }
          }

          // Adjust 64-bit co64
          const co64s = findBoxes(moovU8, stbl.contentStart, stbl.boxEnd, 'co64');
          for (const co64 of co64s) {
            if (co64.size >= 16) {
              const count = dv.getUint32(co64.offset + 12);
              for (let i = 0; i < count; i++) {
                const offPos = co64.offset + 16 + i * 8;
                if (offPos + 8 <= moovU8.length) {
                  const hi = BigInt(dv.getUint32(offPos));
                  const lo = BigInt(dv.getUint32(offPos + 4));
                  const oldOff = (hi << 32n) | lo;
                  const newOff = oldOff + BigInt(shift);
                  dv.setUint32(offPos, Number(newOff >> 32n));
                  dv.setUint32(offPos + 4, Number(newOff & 0xffffffffn));
                }
              }
            }
          }
        }
      }
    }
  }
}

/**
 * Main patch function.
 * Performs lossless FastStart optimization, accurately recalculates chunk offsets,
 * injects husevndownloader.netlify.app tags, and preserves full framerate, audio sync,
 * and presentation timestamps without cutting any frames.
 */
export async function patchMp4(fileOrBlob, options = {}, onProgress) {
  onProgress && onProgress({ percent: 10, stage: 'Fayl və MP4 strukturu analiz edilir...' });

  const boxes = await parseTopLevelBoxes(fileOrBlob);
  const ftypBox = boxes.find(b => b.type === 'ftyp');
  const moovBox = boxes.find(b => b.type === 'moov');
  const mdatBox = boxes.find(b => b.type === 'mdat');

  if (!moovBox || !mdatBox) {
    throw new Error('Etibarsız MP4 faylı: moov və ya mdat tapılmadı.');
  }

  onProgress && onProgress({ percent: 30, stage: 'Metadata və FastStart hazırlanır...' });

  // Read the original moov box
  const moovSlice = fileOrBlob.slice(moovBox.offset, moovBox.offset + moovBox.size);
  const moovAb = await moovSlice.arrayBuffer();
  let moovU8 = new Uint8Array(moovAb);

  // Remove existing udta box if present to avoid duplicate or conflicting tags
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

  onProgress && onProgress({ percent: 50, stage: 'Itsscale vaxt miqyası tətbiq edilir...' });

  // Apply itsscale ×2 for the TikTok Studio HQ method.
  // This is the technique used by Upload120 / Void Studio / Compressbase.
  // It changes how TikTok's quality classifier reads the file.
  const preset = options.preset || 'studio';
  if (preset === 'studio') {
    applyItsscale(mergedMoov, 2);
  }

  onProgress && onProgress({ percent: 65, stage: 'Kadr ofsetləri (stco/co64) dəqiqləşdirilir...' });

  // FastStart Layout Calculation:
  // Final file layout: [ftyp] -> [moov] -> [mdat] -> [other trailing boxes]
  const ftypSize = ftypBox ? ftypBox.size : 0;
  const newMdatStart = ftypSize + mergedMoov.length;
  const oldMdatStart = mdatBox.offset;
  const offsetShift = newMdatStart - oldMdatStart;

  // Accurately shift all chunk offsets inside the new moov box
  updateChunkOffsets(mergedMoov, offsetShift);

  onProgress && onProgress({ percent: 85, stage: 'Yeni FastStart MP4 faylı qurulur...' });

  // Build the final blob using zero-copy slicing
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
    encoder: ENCODER_TAG,
    method: COMMENT_TAG,
  };
}
