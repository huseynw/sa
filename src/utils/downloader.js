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

export const downloadFile = async (url, filename, onProgress) => {
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
