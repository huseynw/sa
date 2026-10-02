const convertBlobToJpg = async (blob) => {
  if (!blob || !blob.type.includes('image')) return blob;
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((jpgBlob) => {
          if (jpgBlob) resolve(jpgBlob);
          else resolve(blob);
        }, 'image/jpeg', 0.98);
      } catch (err) {
        console.warn('Canvas conversion failed, using original blob:', err);
        resolve(blob);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(blob);
    };
    img.src = url;
  });
};

const convertBlobToMp3 = async (blob) => {
  if (!blob) return blob;
  try {
    const headerBuf = await blob.slice(0, 16).arrayBuffer();
    const header = new Uint8Array(headerBuf);
    const isMp3 = (header[0] === 0x49 && header[1] === 0x44 && header[2] === 0x33) ||
                  (header[0] === 0xFF && (header[1] & 0xE0) === 0xE0);
    if (isMp3) return blob;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return blob;

    const audioCtx = new AudioContextClass();
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      const channels = Math.min(2, audioBuffer.numberOfChannels);
      const sampleRate = audioBuffer.sampleRate;
      const { Mp3Encoder } = await import('@breezystack/lamejs');

      const floatTo16BitPCM = (f32) => {
        const out = new Int16Array(f32.length);
        for (let i = 0; i < f32.length; i++) {
          const s = Math.max(-1, Math.min(1, f32[i]));
          out[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return out;
      };

      const left = floatTo16BitPCM(audioBuffer.getChannelData(0));
      const right = channels === 2 ? floatTo16BitPCM(audioBuffer.getChannelData(1)) : null;

      const encoder = new Mp3Encoder(channels, sampleRate, 192);
      const mp3Chunks = [];
      const blockSize = 1152;

      for (let i = 0; i < left.length; i += blockSize) {
        const l = left.subarray(i, i + blockSize);
        let buf;
        if (channels === 2 && right) {
          const r = right.subarray(i, i + blockSize);
          buf = encoder.encodeBuffer(l, r);
        } else {
          buf = encoder.encodeBuffer(l);
        }
        if (buf.length > 0) {
          mp3Chunks.push(buf);
        }
      }
      const end = encoder.flush();
      if (end.length > 0) {
        mp3Chunks.push(end);
      }

      return new Blob(mp3Chunks, { type: 'audio/mpeg' });
    } finally {
      try { await audioCtx.close(); } catch {}
    }
  } catch {
    return blob;
  }
};

const fetchCoverImage = async (url) => {
  if (!url) return null;
  try {
    return await new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const maxDim = 800;
          let w = img.naturalWidth || img.width;
          let h = img.naturalHeight || img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          canvas.toBlob(async (blob) => {
            if (blob) {
              const ab = await blob.arrayBuffer();
              resolve(new Uint8Array(ab));
            } else {
              resolve(null);
            }
          }, 'image/jpeg', 0.9);
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  } catch {
    return null;
  }
};

const buildId3Tag = (title, artist, imageBytes) => {
  const toUtf16Le = (str) => {
    const buf = new Uint8Array(2 + str.length * 2);
    buf[0] = 0xFF;
    buf[1] = 0xFE;
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      buf[2 + i * 2] = code & 0xFF;
      buf[2 + i * 2 + 1] = (code >> 8) & 0xFF;
    }
    return buf;
  };

  const makeFrame = (id, payload) => {
    const frame = new Uint8Array(10 + payload.length);
    for (let i = 0; i < 4; i++) frame[i] = id.charCodeAt(i);
    const sz = payload.length;
    frame[4] = (sz >> 24) & 0xFF;
    frame[5] = (sz >> 16) & 0xFF;
    frame[6] = (sz >> 8) & 0xFF;
    frame[7] = sz & 0xFF;
    frame[8] = 0;
    frame[9] = 0;
    frame.set(payload, 10);
    return frame;
  };

  const makeTextFrame = (id, text) => {
    const textBytes = toUtf16Le(text);
    const payload = new Uint8Array(1 + textBytes.length);
    payload[0] = 0x01;
    payload.set(textBytes, 1);
    return makeFrame(id, payload);
  };

  const makeApicFrame = (imgBytes) => {
    const mime = [105, 109, 97, 103, 101, 47, 106, 112, 101, 103, 0];
    const header = [0x00, ...mime, 0x03, 0x00];
    const payload = new Uint8Array(header.length + imgBytes.length);
    payload.set(header, 0);
    payload.set(imgBytes, header.length);
    return makeFrame('APIC', payload);
  };

  const frames = [];
  if (title) frames.push(makeTextFrame('TIT2', title));
  if (artist) frames.push(makeTextFrame('TPE1', artist));
  if (imageBytes && imageBytes.length > 0) frames.push(makeApicFrame(imageBytes));

  if (frames.length === 0) return null;

  let totalFramesLen = 0;
  for (const f of frames) totalFramesLen += f.length;

  const tag = new Uint8Array(10 + totalFramesLen);
  tag[0] = 0x49;
  tag[1] = 0x44;
  tag[2] = 0x33;
  tag[3] = 0x03;
  tag[4] = 0x00;
  tag[5] = 0x00;
  tag[6] = (totalFramesLen >> 21) & 0x7F;
  tag[7] = (totalFramesLen >> 14) & 0x7F;
  tag[8] = (totalFramesLen >> 7) & 0x7F;
  tag[9] = totalFramesLen & 0x7F;

  let offset = 10;
  for (const f of frames) {
    tag.set(f, offset);
    offset += f.length;
  }
  return tag;
};

const attachId3ToMp3 = async (mp3Blob, meta = {}) => {
  if (!mp3Blob) return mp3Blob;
  try {
    const imgBytes = meta.coverUrl ? await fetchCoverImage(meta.coverUrl) : null;
    const tag = buildId3Tag(meta.title, meta.artist, imgBytes);
    if (!tag) return mp3Blob;

    let audioBytes = new Uint8Array(await mp3Blob.arrayBuffer());
    if (audioBytes[0] === 0x49 && audioBytes[1] === 0x44 && audioBytes[2] === 0x33) {
      const oldTagSize = 10 + ((audioBytes[6] & 0x7F) << 21 |
                               (audioBytes[7] & 0x7F) << 14 |
                               (audioBytes[8] & 0x7F) << 7 |
                               (audioBytes[9] & 0x7F));
      if (oldTagSize < audioBytes.length) {
        audioBytes = audioBytes.subarray(oldTagSize);
      }
    }

    return new Blob([tag, audioBytes], { type: 'audio/mpeg' });
  } catch {
    return mp3Blob;
  }
};

// --- MP4 Binary Box Parser & Gallery Sanitizer ---

function findMp4Box(view, targetType, start = 0, end = view.byteLength) {
  let off = start;
  while (off <= end - 8) {
    const size = view.getUint32(off, false);
    const type = String.fromCharCode(
      view.getUint8(off + 4),
      view.getUint8(off + 5),
      view.getUint8(off + 6),
      view.getUint8(off + 7)
    );
    const boxSize = size === 1 ? Number(view.getBigUint64(off + 8, false)) : (size === 0 ? end - off : size);
    if (boxSize < 8 || off + boxSize > end) break;
    if (type === targetType) return { offset: off, size: boxSize, headerSize: size === 1 ? 16 : 8 };
    off += boxSize;
  }
  return null;
}

function findAllMp4Boxes(view, targetType, start = 0, end = view.byteLength) {
  const list = [];
  let off = start;
  while (off <= end - 8) {
    const size = view.getUint32(off, false);
    const type = String.fromCharCode(
      view.getUint8(off + 4),
      view.getUint8(off + 5),
      view.getUint8(off + 6),
      view.getUint8(off + 7)
    );
    const boxSize = size === 1 ? Number(view.getBigUint64(off + 8, false)) : (size === 0 ? end - off : size);
    if (boxSize < 8 || off + boxSize > end) break;
    if (type === targetType) list.push({ offset: off, size: boxSize, headerSize: size === 1 ? 16 : 8 });
    off += boxSize;
  }
  return list;
}

/**
 * Lossless in-browser MP4 container repair for phone gallery compatibility.
 * 
 * Why:
 * When videos uploaded via custom patchers or 120 FPS techniques are downloaded back
 * from TikTok, mvhd.duration is often 0xFFFFFFFFFFFFFFFF (unknown/infinite).
 * Mobile video engines (iOS Photos app AVFoundation, Samsung/Xiaomi Gallery Stagefright)
 * crash or fail with "Cannot Open Video" on invalid durations.
 * 
 * This function calculates the exact track duration from the sample table (stts) or mdhd
 * and writes a valid duration into mvhd, tkhd, mdhd, and elst without touching the video/audio
 * payload (mdat). Result: 100% original quality, zero recompression, perfect gallery playback.
 */
export function sanitizeMp4Buffer(arrayBuffer, { isMuted = false } = {}) {
  try {
    const bytes = new Uint8Array(arrayBuffer);
    if (bytes.length < 32) return bytes;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    const moov = findMp4Box(view, 'moov');
    if (!moov) return bytes;

    const mvhd = findMp4Box(view, 'mvhd', moov.offset + moov.headerSize, moov.offset + moov.size);
    if (!mvhd) return bytes;

    const mvhdVer = view.getUint8(mvhd.offset + mvhd.headerSize);
    const mvhdTs = mvhdVer === 0
      ? view.getUint32(mvhd.offset + mvhd.headerSize + 12, false)
      : view.getUint32(mvhd.offset + mvhd.headerSize + 20, false);

    const rawMvhdDur = mvhdVer === 0
      ? view.getUint32(mvhd.offset + mvhd.headerSize + 16, false)
      : view.getBigUint64(mvhd.offset + mvhd.headerSize + 24, false);

    const traks = findAllMp4Boxes(view, 'trak', moov.offset + moov.headerSize, moov.offset + moov.size);
    let maxDurSec = 0;
    let videoDurSec = 0;
    let audioTrackCount = 0;
    const trakMeta = [];

    for (const trak of traks) {
      const tkhd = findMp4Box(view, 'tkhd', trak.offset + trak.headerSize, trak.offset + trak.size);
      const mdia = findMp4Box(view, 'mdia', trak.offset + trak.headerSize, trak.offset + trak.size);
      if (!mdia) continue;

      const hdlr = findMp4Box(view, 'hdlr', mdia.offset + mdia.headerSize, mdia.offset + mdia.size);
      let handler = '';
      if (hdlr) {
        handler = String.fromCharCode(
          view.getUint8(hdlr.offset + hdlr.headerSize + 8),
          view.getUint8(hdlr.offset + hdlr.headerSize + 9),
          view.getUint8(hdlr.offset + hdlr.headerSize + 10),
          view.getUint8(hdlr.offset + hdlr.headerSize + 11)
        );
      }

      const mdhd = findMp4Box(view, 'mdhd', mdia.offset + mdia.headerSize, mdia.offset + mdia.size);
      if (!mdhd) continue;

      const mdhdVer = view.getUint8(mdhd.offset + mdhd.headerSize);
      const mdhdTs = mdhdVer === 0
        ? view.getUint32(mdhd.offset + mdhd.headerSize + 12, false)
        : view.getUint32(mdhd.offset + mdhd.headerSize + 20, false);

      let trackDurUnits = 0;
      const minf = findMp4Box(view, 'minf', mdia.offset + mdia.headerSize, mdia.offset + mdia.size);
      if (minf) {
        const stbl = findMp4Box(view, 'stbl', minf.offset + minf.headerSize, minf.offset + minf.size);
        if (stbl) {
          const stts = findMp4Box(view, 'stts', stbl.offset + stbl.headerSize, stbl.offset + stbl.size);
          if (stts) {
            const entryCount = view.getUint32(stts.offset + stts.headerSize + 4, false);
            let sumDelta = 0;
            let off = stts.offset + stts.headerSize + 8;
            for (let i = 0; i < entryCount; i++) {
              if (off + 8 > stts.offset + stts.size) break;
              const sc = view.getUint32(off, false);
              const sd = view.getUint32(off + 4, false);
              sumDelta += sc * sd;
              off += 8;
            }
            if (sumDelta > 0) trackDurUnits = sumDelta;
          }
        }
      }

      if (!trackDurUnits) {
        const rawMdhdDur = mdhdVer === 0
          ? view.getUint32(mdhd.offset + mdhd.headerSize + 16, false)
          : Number(view.getBigUint64(mdhd.offset + mdhd.headerSize + 24, false));
        if (rawMdhdDur > 0 && rawMdhdDur !== 0xFFFFFFFF && rawMdhdDur !== 0xFFFFFFFFFFFFFFFFn) {
          trackDurUnits = rawMdhdDur;
        }
      }

      const durSec = (mdhdTs > 0 && trackDurUnits > 0) ? (trackDurUnits / mdhdTs) : 0;
      if (durSec > 0 && durSec < 86400 * 30) {
        if (durSec > maxDurSec) maxDurSec = durSec;
        if (handler === 'vide' && durSec > videoDurSec) videoDurSec = durSec;
      }

      if (handler === 'soun') audioTrackCount++;

      trakMeta.push({
        trak, tkhd, mdia, mdhd, mdhdVer, mdhdTs, handler,
        trackDurUnits, durSec,
        isSecondaryAudio: handler === 'soun' && audioTrackCount > 1
      });
    }

    // Always disable secondary audio tracks to prevent double-audio/chorus on iOS/QuickTime
    if (audioTrackCount > 1) {
      for (const info of trakMeta) {
        if (info.handler === 'soun' && info.isSecondaryAudio && info.tkhd) {
          bytes[info.tkhd.offset + info.tkhd.headerSize + 1] = 0;
          bytes[info.tkhd.offset + info.tkhd.headerSize + 2] = 0;
          bytes[info.tkhd.offset + info.tkhd.headerSize + 3] = 0;
        }
      }
    }

    const effectiveDurSec = videoDurSec > 0 ? videoDurSec : maxDurSec;
    const isMvhdBroken = (
      rawMvhdDur <= 0 ||
      rawMvhdDur === 0xFFFFFFFF ||
      rawMvhdDur === 0xFFFFFFFFFFFFFFFFn ||
      (mvhdTs > 0 && (Number(rawMvhdDur) / mvhdTs) > 86400 * 30)
    );

    if ((isMvhdBroken || isMuted) && effectiveDurSec > 0 && mvhdTs > 0) {
      const fixedMvhdDur = Math.round(effectiveDurSec * mvhdTs);
      if (mvhdVer === 0) {
        view.setUint32(mvhd.offset + mvhd.headerSize + 16, fixedMvhdDur, false);
      } else {
        view.setBigUint64(mvhd.offset + mvhd.headerSize + 24, BigInt(fixedMvhdDur), false);
      }

      for (const info of trakMeta) {
        const trackDurInMvhd = Math.round((info.durSec || effectiveDurSec) * mvhdTs);

        if (info.tkhd) {
          const tkhdVer = view.getUint8(info.tkhd.offset + info.tkhd.headerSize);
          if (tkhdVer === 0) {
            view.setUint32(info.tkhd.offset + info.tkhd.headerSize + 20, trackDurInMvhd, false);
          } else {
            view.setBigUint64(info.tkhd.offset + info.tkhd.headerSize + 28, BigInt(trackDurInMvhd), false);
          }

          if (info.handler === 'soun') {
            if (isMuted || info.isSecondaryAudio) {
              bytes[info.tkhd.offset + info.tkhd.headerSize + 1] = 0;
              bytes[info.tkhd.offset + info.tkhd.headerSize + 2] = 0;
              bytes[info.tkhd.offset + info.tkhd.headerSize + 3] = 0;
            } else {
              bytes[info.tkhd.offset + info.tkhd.headerSize + 1] = 0;
              bytes[info.tkhd.offset + info.tkhd.headerSize + 2] = 0;
              bytes[info.tkhd.offset + info.tkhd.headerSize + 3] = 3;
            }
          } else if (info.handler === 'vide') {
            bytes[info.tkhd.offset + info.tkhd.headerSize + 1] = 0;
            bytes[info.tkhd.offset + info.tkhd.headerSize + 2] = 0;
            bytes[info.tkhd.offset + info.tkhd.headerSize + 3] = 3;
          }
        }

        if (info.mdhd && info.trackDurUnits > 0) {
          if (info.mdhdVer === 0) {
            view.setUint32(info.mdhd.offset + info.mdhd.headerSize + 16, info.trackDurUnits, false);
          } else {
            view.setBigUint64(info.mdhd.offset + info.mdhd.headerSize + 24, BigInt(info.trackDurUnits), false);
          }
        }

        const edts = findMp4Box(view, 'edts', info.trak.offset + info.trak.headerSize, info.trak.offset + info.trak.size);
        if (edts) {
          const elst = findMp4Box(view, 'elst', edts.offset + edts.headerSize, edts.offset + edts.size);
          if (elst) {
            const elstVer = view.getUint8(elst.offset + elst.headerSize);
            const entryCount = view.getUint32(elst.offset + elst.headerSize + 4, false);
            let elstOff = elst.offset + elst.headerSize + 8;
            for (let i = 0; i < entryCount; i++) {
              if (elstVer === 0) {
                if (elstOff + 12 > elst.offset + elst.size) break;
                const segDur = view.getUint32(elstOff, false);
                if (segDur === 0xFFFFFFFF || segDur <= 0 || (mvhdTs > 0 && segDur / mvhdTs > 86400 * 30)) {
                  view.setUint32(elstOff, trackDurInMvhd, false);
                }
                elstOff += 12;
              } else {
                if (elstOff + 20 > elst.offset + elst.size) break;
                const segDur = view.getBigUint64(elstOff, false);
                if (segDur === 0xFFFFFFFFFFFFFFFFn || segDur <= 0n || (mvhdTs > 0 && Number(segDur) / mvhdTs > 86400 * 30)) {
                  view.setBigUint64(elstOff, BigInt(trackDurInMvhd), false);
                }
                elstOff += 20;
              }
            }
          }
        }
      }
    }

    return bytes;
  } catch (err) {
    console.warn('[downloader] sanitizeMp4Buffer exception:', err);
    return new Uint8Array(arrayBuffer);
  }
}

export const sanitizeVideoForGallery = async (blob, { isMuted = false } = {}) => {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const cleanBytes = sanitizeMp4Buffer(arrayBuffer, { isMuted });
    return new Blob([cleanBytes], { type: 'video/mp4' });
  } catch (err) {
    console.warn('[downloader] sanitizeVideoForGallery error:', err);
    if (blob.type !== 'video/mp4') {
      return new Blob([blob], { type: 'video/mp4' });
    }
    return blob;
  }
};

export const downloadFile = async (url, filename, onProgress, metadata = {}) => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.responseType = "blob";

    let startTime = Date.now();
    let previousLoaded = 0;

    xhr.onprogress = (event) => {
      if (event.lengthComputable) {
        const percentComplete = (event.loaded / event.total) * 100;
        const timeElapsed = (Date.now() - startTime) / 1000;

        let speed = 0;
        if (timeElapsed > 0.5) {
          const loadedSinceLast = event.loaded - previousLoaded;
          speed = loadedSinceLast / timeElapsed;
          startTime = Date.now();
          previousLoaded = event.loaded;
        }

        const speedMbps = (speed / (1024 * 1024)).toFixed(2);
        onProgress && onProgress({
          percent: Math.round(percentComplete),
          speed: speedMbps
        });
      }
    };

    xhr.onload = async () => {
      if (xhr.status === 200) {
        let blob = xhr.response;
        let outName = filename || "download";

        if (blob.type.includes('image') || outName.toLowerCase().endsWith('.webp') || outName.toLowerCase().endsWith('.jpg') || outName.toLowerCase().endsWith('.png')) {
          try {
            blob = await convertBlobToJpg(blob);
            outName = outName.replace(/\.(webp|png|jpeg)$/i, '') + '.jpg';
            if (!outName.toLowerCase().endsWith('.jpg')) outName += '.jpg';
          } catch {}
        } else if (outName.toLowerCase().endsWith('.mp3')) {
          try {
            onProgress && onProgress({ percent: 99, speed: 'MP3...' });
            blob = await convertBlobToMp3(blob);
            blob = await attachId3ToMp3(blob, metadata);
          } catch {}
        } else if (outName.toLowerCase().endsWith('.mp4') || blob.type.includes('video')) {
          try {
            onProgress && onProgress({ percent: 99, speed: 'Optimizasiya...' });
            blob = await sanitizeVideoForGallery(blob, { isMuted: !!metadata.isMuted });
            outName = outName.replace(/\.(mp4|mov|m4v)$/i, '') + '.mp4';
          } catch (e) {
            console.warn('[downloader] Video gallery sanitation error:', e.message);
            if (blob.type !== 'video/mp4') {
              blob = new Blob([blob], { type: 'video/mp4' });
            }
          }
        }

        // On mobile devices (iOS / Android), Web Share API provides direct 1-tap "Save Video"
        // directly into the native Photos / Gallery app!
        const isMobile = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        const file = new File([blob], outName, { type: blob.type || 'video/mp4' });

        if (isMobile && typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: outName,
            });
            resolve();
            return;
          } catch (shareErr) {
            if (shareErr.name === 'AbortError') {
              resolve();
              return;
            }
          }
        }

        // Standard anchor download fallback
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.style.display = "none";
        a.href = blobUrl;
        a.download = outName;
        document.body.appendChild(a);

        const clickEvent = new MouseEvent('click', {
          view: window,
          bubbles: true,
          cancelable: true
        });
        a.dispatchEvent(clickEvent);

        setTimeout(() => {
          document.body.removeChild(a);
          window.URL.revokeObjectURL(blobUrl);
        }, 10000);

        resolve();
      } else {
        reject(new Error(`Download failed with status ${xhr.status}`));
      }
    };

    xhr.onerror = () => {
      reject(new Error("Network error occurred during download"));
    };

    xhr.send();
  });
};
