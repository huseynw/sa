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
          } catch (e) {
            console.warn('JPG conversion error:', e);
          }
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
