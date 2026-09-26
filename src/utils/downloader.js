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
        }

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
