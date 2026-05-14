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
        const timeElapsed = (Date.now() - startTime) / 1000; // in seconds
        
        // Calculate speed in bytes per second
        let speed = 0;
        if (timeElapsed > 0.5) { // update speed every 0.5s for stability
          const loadedSinceLast = event.loaded - previousLoaded;
          speed = loadedSinceLast / timeElapsed; // bytes per second
          
          // Reset for next calculation
          startTime = Date.now();
          previousLoaded = event.loaded;
        }

        // Convert speed to MB/s
        const speedMbps = (speed / (1024 * 1024)).toFixed(2);

        onProgress({
          percent: Math.round(percentComplete),
          speed: speedMbps
        });
      }
    };

    xhr.onload = () => {
      if (xhr.status === 200) {
        const blob = xhr.response;
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.style.display = "none";
        a.href = blobUrl;
        a.download = filename || "download";
        document.body.appendChild(a);
        
        // Daha etibarlı klik eventi (bəzi brauzerlər a.click() bloklayır)
        const clickEvent = new MouseEvent('click', {
          view: window,
          bubbles: true,
          cancelable: true
        });
        a.dispatchEvent(clickEvent);
        
        setTimeout(() => {
          document.body.removeChild(a);
          window.URL.revokeObjectURL(blobUrl);
        }, 10000); // 10 saniyə gözləyirik ki, stəbil yazıla bilsin
        
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
