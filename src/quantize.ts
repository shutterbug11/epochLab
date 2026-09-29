/**
 * High-performance median-cut color quantization for GIF generation.
 * Maps RGBA canvas image data to a palette of up to 256 colors and an indexed pixel buffer.
 */

export interface QuantizedImage {
  palette: number[]; // Array of 0xRRGGBB integers (length is a power of 2, max 256)
  indexedPixels: Uint8Array;
}

interface ColorPoint {
  r: number;
  g: number;
  b: number;
  count: number;
}

interface ColorBox {
  colors: ColorPoint[];
  rMin: number;
  rMax: number;
  gMin: number;
  gMax: number;
  bMin: number;
  bMax: number;
  totalCount: number;
}

function createBox(colors: ColorPoint[]): ColorBox {
  let rMin = 255, rMax = 0;
  let gMin = 255, gMax = 0;
  let bMin = 255, bMax = 0;
  let totalCount = 0;

  for (let i = 0; i < colors.length; i++) {
    let c = colors[i];
    totalCount += c.count;
    if (c.r < rMin) rMin = c.r;
    if (c.r > rMax) rMax = c.r;
    if (c.g < gMin) gMin = c.g;
    if (c.g > gMax) gMax = c.g;
    if (c.b < bMin) bMin = c.b;
    if (c.b > bMax) bMax = c.b;
  }

  return { colors, rMin, rMax, gMin, gMax, bMin, bMax, totalCount };
}

function getBoxVolume(box: ColorBox): number {
  return (box.rMax - box.rMin + 1) * (box.gMax - box.gMin + 1) * (box.bMax - box.bMin + 1);
}

function splitBox(box: ColorBox): [ColorBox, ColorBox] {
  if (box.colors.length <= 1) {
    return [box, null];
  }

  let rRange = box.rMax - box.rMin;
  let gRange = box.gMax - box.gMin;
  let bRange = box.bMax - box.bMin;

  let axis: 'r' | 'g' | 'b' = 'r';
  if (gRange >= rRange && gRange >= bRange) {
    axis = 'g';
  } else if (bRange >= rRange && bRange >= gRange) {
    axis = 'b';
  }

  box.colors.sort((a, b) => a[axis] - b[axis]);

  let medianCount = box.totalCount / 2;
  let accumulated = 0;
  let splitIndex = 0;

  for (let i = 0; i < box.colors.length - 1; i++) {
    accumulated += box.colors[i].count;
    if (accumulated >= medianCount) {
      splitIndex = i + 1;
      break;
    }
  }

  if (splitIndex === 0) {
    splitIndex = Math.floor(box.colors.length / 2);
  }

  let box1 = createBox(box.colors.slice(0, splitIndex));
  let box2 = createBox(box.colors.slice(splitIndex));
  return [box1, box2];
}

export function quantize(rgbaData: Uint8ClampedArray, maxColors = 256): QuantizedImage {
  let pixelCount = rgbaData.length / 4;

  // 15-bit color histogram: 5 bits per channel (32 x 32 x 32 = 32768)
  let histogram = new Uint32Array(32768);

  for (let i = 0; i < rgbaData.length; i += 4) {
    let a = rgbaData[i + 3];
    let r = rgbaData[i];
    let g = rgbaData[i + 1];
    let b = rgbaData[i + 2];

    // Treat transparent/semi-transparent pixels as white background
    if (a < 128) {
      r = 255;
      g = 255;
      b = 255;
    }

    let key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    histogram[key]++;
  }

  let colorPoints: ColorPoint[] = [];
  for (let key = 0; key < 32768; key++) {
    let count = histogram[key];
    if (count > 0) {
      let r = ((key >> 10) & 31) << 3;
      let g = ((key >> 5) & 31) << 3;
      let b = (key & 31) << 3;
      colorPoints.push({ r, g, b, count });
    }
  }

  if (colorPoints.length === 0) {
    colorPoints.push({ r: 255, g: 255, b: 255, count: 1 });
  }

  let boxes: ColorBox[] = [createBox(colorPoints)];

  while (boxes.length < maxColors) {
    // Pick the box with largest span / count
    let bestIdx = -1;
    let bestScore = -1;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].colors.length > 1) {
        let score = getBoxVolume(boxes[i]) * Math.log(boxes[i].totalCount + 1);
        if (score > bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }
    }

    if (bestIdx === -1) {
      break;
    }

    let targetBox = boxes.splice(bestIdx, 1)[0];
    let [b1, b2] = splitBox(targetBox);
    boxes.push(b1);
    if (b2 && b2.colors.length > 0) {
      boxes.push(b2);
    }
  }

  // Derive representative palette colors
  let rawPalette: { r: number; g: number; b: number }[] = [];
  for (let box of boxes) {
    let rSum = 0, gSum = 0, bSum = 0, countSum = 0;
    for (let c of box.colors) {
      rSum += c.r * c.count;
      gSum += c.g * c.count;
      bSum += c.b * c.count;
      countSum += c.count;
    }
    if (countSum > 0) {
      rawPalette.push({
        r: Math.round(rSum / countSum),
        g: Math.round(gSum / countSum),
        b: Math.round(bSum / countSum)
      });
    }
  }

  if (rawPalette.length === 0) {
    rawPalette.push({ r: 255, g: 255, b: 255 });
  }

  // omggif requires palette length to be a power of 2 (2..256)
  let targetLen = 2;
  while (targetLen < rawPalette.length && targetLen < 256) {
    targetLen <<= 1;
  }
  if (targetLen > 256) targetLen = 256;

  while (rawPalette.length < targetLen) {
    rawPalette.push({ r: 0, g: 0, b: 0 });
  }

  let palette: number[] = rawPalette.map(c => (c.r << 16) | (c.g << 8) | c.b);

  // Fast 15-bit color lookup table
  let lut = new Uint8Array(32768);
  for (let key = 0; key < 32768; key++) {
    if (histogram[key] > 0) {
      let r = ((key >> 10) & 31) << 3;
      let g = ((key >> 5) & 31) << 3;
      let b = (key & 31) << 3;

      let bestDist = Infinity;
      let bestIndex = 0;
      for (let p = 0; p < rawPalette.length; p++) {
        let pr = rawPalette[p].r;
        let pg = rawPalette[p].g;
        let pb = rawPalette[p].b;
        let dist = (r - pr) * (r - pr) + (g - pg) * (g - pg) + (b - pb) * (b - pb);
        if (dist < bestDist) {
          bestDist = dist;
          bestIndex = p;
        }
      }
      lut[key] = bestIndex;
    }
  }

  let indexedPixels = new Uint8Array(pixelCount);
  for (let i = 0, p = 0; i < rgbaData.length; i += 4, p++) {
    let a = rgbaData[i + 3];
    let r = rgbaData[i];
    let g = rgbaData[i + 1];
    let b = rgbaData[i + 2];

    if (a < 128) {
      r = 255;
      g = 255;
      b = 255;
    }

    let key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    indexedPixels[p] = lut[key];
  }

  return { palette, indexedPixels };
}
