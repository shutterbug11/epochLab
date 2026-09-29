import { quantize } from "./quantize";
declare var Promise: any;
declare var require: any;
const omggif = require("omggif");

export interface GifFrame {
  imageData: ImageData;
  delayMs: number;
}

export class GifEncoder {
  private width: number;
  private height: number;
  private frames: GifFrame[] = [];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  addFrame(imageData: ImageData, delayMs = 100) {
    this.frames.push({ imageData, delayMs });
  }

  getFrameCount(): number {
    return this.frames.length;
  }

  clear() {
    this.frames = [];
  }

  /**
   * Encodes all collected frames into a GIF Blob.
   * Runs asynchronously in ticks to prevent UI freeze and support progress callbacks.
   */
  encode(onProgress?: (progress: number) => void): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (this.frames.length === 0) {
        reject(new Error("No frames to encode"));
        return;
      }

      // Estimate buffer size: 5 bytes per pixel per frame + header is safe upper bound
      let maxBytes = this.width * this.height * this.frames.length * 3 + 4096;
      let buf = new Uint8Array(Math.min(maxBytes, 120 * 1024 * 1024)); // Cap at 120MB
      let writer: any;

      try {
        writer = new omggif.GifWriter(buf, this.width, this.height, { loop: 0 });
      } catch (err) {
        reject(err);
        return;
      }

      let frameIdx = 0;
      let totalFrames = this.frames.length;

      let processNext = () => {
        if (frameIdx >= totalFrames) {
          try {
            let totalBytes = writer.end();
            let finalSlice = buf.subarray(0, totalBytes);
            let blob = new Blob([finalSlice], { type: "image/gif" });
            if (onProgress) onProgress(100);
            resolve(blob);
          } catch (e) {
            reject(e);
          }
          return;
        }

        let f = this.frames[frameIdx];
        let quantized = quantize(f.imageData.data, 256);
        let delayHundredths = Math.max(2, Math.round(f.delayMs / 10));

        writer.addFrame(0, 0, this.width, this.height, quantized.indexedPixels, {
          palette: quantized.palette,
          delay: delayHundredths
        });

        frameIdx++;
        let pct = Math.round((frameIdx / totalFrames) * 98);
        if (onProgress) onProgress(pct);

        setTimeout(processNext, 4);
      };

      setTimeout(processNext, 0);
    });
  }
}
