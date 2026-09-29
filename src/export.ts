import * as nn from "./nn";
import {
  State,
  datasets,
  regDatasets,
  activations,
  problems,
  regularizations,
  getKeyFromValue,
  Problem
} from "./state";
import { GifEncoder } from "./gif_encoder";

declare var Promise: any;

export interface PngExportOptions {
  mode?: "full" | "heatmap";
  scale?: number; // 1 = standard, 2 = 2x Retina/High-DPI
  includeWatermark?: boolean;
}

export interface GifRecordingOptions {
  mode?: "full" | "heatmap";
  frameInterval?: number; // Capture every N iterations
  maxFrames?: number; // Max frames to capture
  fps?: number; // Frames per second
}

export interface ExportCallbacks {
  getIter: () => number;
  getLossTrain: () => number;
  getLossTest: () => number;
  getNetwork: () => nn.Node[][];
  getState: () => State;
  getOutputWeights: (network: nn.Node[][]) => number[];
  rebuildNetworkAndUI: (importedState: State, weights?: number[], biases?: {[id: string]: number}, links?: any[]) => void;
  showToast: (msg: string) => void;
  pausePlayer: () => void;
  playPlayer: () => void;
  isPlayerPlaying: () => boolean;
}

export function downloadBlob(blob: Blob, filename: string) {
  let url = URL.createObjectURL(blob);
  let a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Serializes an SVG element into an HTMLImageElement with embedded styling.
 */
function serializeSvgToImage(svgEl: SVGElement, width: number, height: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    let cloned = svgEl.cloneNode(true) as SVGElement;
    cloned.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    cloned.setAttribute("width", String(width));
    cloned.setAttribute("height", String(height));

    // 1. Remove all invisible thick hover paths (.link-hover).
    // In the browser, these have opacity: 0 and are used only for hover detection.
    // In an isolated SVG image without external CSS, their default fill is solid black,
    // which distorts and covers the real neural network connections with massive black shapes.
    let hoverLinks = cloned.querySelectorAll(".link-hover");
    for (let i = 0; i < hoverLinks.length; i++) {
      if (hoverLinks[i].parentNode) {
        hoverLinks[i].parentNode.removeChild(hoverLinks[i]);
      }
    }

    // 2. Ensure every visible link has fill="none" and accurate live stroke colors & widths
    let clonedLinks = cloned.querySelectorAll("path.link");
    for (let i = 0; i < clonedLinks.length; i++) {
      let cl = clonedLinks[i] as SVGPathElement;
      cl.setAttribute("fill", "none");
      cl.style.fill = "none";
      cl.style.strokeDasharray = "9 1";
      cl.setAttribute("stroke-dasharray", "9 1");

      let id = cl.getAttribute("id");
      if (id) {
        let orig = svgEl.querySelector("#" + id) as SVGPathElement;
        if (orig) {
          let computed = window.getComputedStyle(orig);
          let stroke = orig.style.stroke || computed.stroke;
          let strokeWidth = orig.style.strokeWidth || computed.strokeWidth;
          let strokeDashoffset = orig.style.strokeDashoffset || computed.strokeDashoffset;

          if (stroke) {
            cl.setAttribute("stroke", stroke);
            cl.style.stroke = stroke;
          }
          if (strokeWidth) {
            cl.setAttribute("stroke-width", strokeWidth);
            cl.style.strokeWidth = strokeWidth;
          }
          if (strokeDashoffset) {
            cl.setAttribute("stroke-dashoffset", strokeDashoffset);
            cl.style.strokeDashoffset = strokeDashoffset;
          }
        }
      }
    }

    // 3. Ensure bias rectangles retain their exact fill colors
    let clonedBiases = cloned.querySelectorAll("rect[id^='bias-']");
    for (let i = 0; i < clonedBiases.length; i++) {
      let cb = clonedBiases[i] as SVGRectElement;
      let id = cb.getAttribute("id");
      if (id) {
        let orig = svgEl.querySelector("#" + id) as SVGRectElement;
        if (orig) {
          let fill = orig.style.fill || window.getComputedStyle(orig).fill;
          if (fill) {
            cb.setAttribute("fill", fill);
            cb.style.fill = fill;
          }
        }
      }
    }

    // 4. Ensure arrowhead marker is properly defined and styled as clean chevron
    let marker = cloned.querySelector("#markerArrow");
    if (marker) {
      marker.setAttribute("orient", "auto");
      let markerPath = marker.querySelector("path");
      if (markerPath) {
        markerPath.setAttribute("fill", "none");
        markerPath.setAttribute("stroke", "rgba(0, 0, 0, 0.4)");
        markerPath.setAttribute("stroke-width", "1.5");
        markerPath.setAttribute("stroke-linecap", "round");
        markerPath.setAttribute("stroke-linejoin", "round");
      }
    }

    // 5. Ensure CSS styles for SVG elements are baked into the serialized SVG
    let style = document.createElementNS("http://www.w3.org/2000/svg", "style");
    style.textContent = `
      text.main-label { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 13px; fill: #24292f; font-weight: 500; }
      tspan { font-size: 9px; }
      path.link { fill: none !important; stroke-dasharray: 9 1 !important; }
      .link-hover, path.link-hover { display: none !important; visibility: hidden !important; opacity: 0 !important; fill: none !important; stroke: none !important; }
      .node rect { fill: #ffffff; stroke: #d0d7de; stroke-width: 1px; rx: 3px; ry: 3px; }
      #markerArrow { fill: none !important; }
      #markerArrow path { fill: none !important; stroke: rgba(0, 0, 0, 0.4) !important; stroke-width: 1.5px !important; stroke-linecap: round !important; stroke-linejoin: round !important; }
      .tick text { fill: #6e7781; font-family: -apple-system, Roboto, sans-serif; font-size: 10px; }
      .tick line { stroke: #d0d7de; }
    `;
    cloned.insertBefore(style, cloned.firstChild);

    let serializer = new XMLSerializer();
    let svgStr = serializer.serializeToString(cloned);
    let svgUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgStr);

    let img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      // Fallback with Blob URL
      try {
        let blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
        let blobUrl = URL.createObjectURL(blob);
        let img2 = new Image();
        img2.onload = () => {
          URL.revokeObjectURL(blobUrl);
          resolve(img2);
        };
        img2.onerror = err => {
          URL.revokeObjectURL(blobUrl);
          reject(err);
        };
        img2.src = blobUrl;
      } catch (err) {
        reject(err);
      }
    };
    img.src = svgUrl;
  });
}

/**
 * Composites the network visualization, heatmap, loss, metadata, and TronLab watermark
 * onto a high-res HTML5 Canvas.
 */
export async function renderVisualizationToCanvas(
  callbacks: ExportCallbacks,
  options: PngExportOptions = {}
): Promise<HTMLCanvasElement> {
  let mode = options.mode || "full";
  let scale = options.scale || 2; // Default 2x for crisp high-res output
  let includeWatermark = options.includeWatermark !== false;

  let state = callbacks.getState();
  let iter = callbacks.getIter();
  let lossTrain = callbacks.getLossTrain();
  let lossTest = callbacks.getLossTest();

  let datasetKey = state.problem === Problem.CLASSIFICATION ?
      getKeyFromValue(datasets, state.dataset) :
      getKeyFromValue(regDatasets, state.regDataset);
  let actKey = getKeyFromValue(activations, state.activation) || "tanh";
  let datasetFormatted = datasetKey ? (datasetKey.charAt(0).toUpperCase() + datasetKey.slice(1)) : "Dataset";

  // Elements from DOM
  let svgEl = document.querySelector("#svg") as SVGSVGElement;
  let heatmapContainer = document.querySelector("#heatmap");
  let heatmapCanvas = heatmapContainer ? (heatmapContainer.querySelector("canvas") as HTMLCanvasElement) : null;
  let heatmapSvg = heatmapContainer ? (heatmapContainer.querySelector("svg") as SVGElement) : null;

  if (mode === "heatmap" || !svgEl) {
    // Mode: Decision Boundary Heatmap Focus (Square Card)
    let cardW = 440;
    let cardH = 500;
    let canvas = document.createElement("canvas");
    canvas.width = cardW * scale;
    canvas.height = cardH * scale;
    let ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);

    // Card Background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cardW, cardH);

    // Card Header Bar
    ctx.fillStyle = "#183D4E";
    ctx.fillRect(0, 0, cardW, 56);

    // Header Title
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 17px -apple-system, BlinkMacSystemFont, Roboto, sans-serif";
    ctx.fillText("EpochLab", 16, 26);
    ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
    ctx.font = "12px -apple-system, BlinkMacSystemFont, Roboto, sans-serif";
    ctx.fillText("Decision Boundary & Output Space", 16, 44);

    // Header Right: Epoch Badge
    let epochText = `Epoch ${iter}`;
    ctx.font = "bold 13px -apple-system, BlinkMacSystemFont, Roboto, sans-serif";
    let epochW = ctx.measureText(epochText).width;
    ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
    ctx.beginPath();
    ctx.rect(cardW - epochW - 28, 16, epochW + 16, 24);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.fillText(epochText, cardW - epochW - 20, 33);

    // Heatmap Container
    let hmX = (cardW - 300) / 2;
    let hmY = 74;

    // Draw Heatmap Canvas
    if (heatmapCanvas) {
      ctx.drawImage(heatmapCanvas, hmX, hmY, 300, 300);
    } else {
      ctx.fillStyle = "#eee";
      ctx.fillRect(hmX, hmY, 300, 300);
    }

    // Draw Heatmap Data Points SVG
    if (heatmapSvg) {
      try {
        let ptsImg = await serializeSvgToImage(heatmapSvg, 300, 300);
        ctx.drawImage(ptsImg, hmX, hmY, 300, 300);
      } catch (e) {
        console.warn("Could not draw heatmap SVG points:", e);
      }
    }

    // Heatmap Border
    ctx.strokeStyle = "#d0d7de";
    ctx.lineWidth = 1;
    ctx.strokeRect(hmX, hmY, 300, 300);

    // Metrics Bar
    let metricsY = hmY + 300 + 20;
    ctx.fillStyle = "#57606a";
    ctx.font = "12px -apple-system, BlinkMacSystemFont, Roboto, sans-serif";
    ctx.fillText(`Dataset: ${datasetFormatted} (${actKey.toUpperCase()})`, hmX, metricsY);
    ctx.fillText(`Train: ${lossTrain.toFixed(3)}  |  Test: ${lossTest.toFixed(3)}`, hmX, metricsY + 18);

    // Watermark Footer
    if (includeWatermark) {
      ctx.fillStyle = "#f6f8fa";
      ctx.fillRect(0, cardH - 36, cardW, 36);
      ctx.strokeStyle = "#e1e4e8";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, cardH - 36);
      ctx.lineTo(cardW, cardH - 36);
      ctx.stroke();

      ctx.fillStyle = "#0969da";
      ctx.font = "bold 11px -apple-system, BlinkMacSystemFont, Roboto, sans-serif";
      ctx.fillText("⚡ EpochLab", 16, cardH - 14);
      ctx.fillStyle = "#57606a";
      ctx.font = "11px -apple-system, BlinkMacSystemFont, Roboto, sans-serif";
      ctx.fillText("• Interactive Neural Laboratory • epochlab.org", 78, cardH - 14);
    }

    return canvas;
  }

  // Mode: Full Model Architecture + Decision Boundary Landscape
  let svgW = svgEl.clientWidth || parseInt(svgEl.getAttribute("width")) || 510;
  let svgH = svgEl.clientHeight || parseInt(svgEl.getAttribute("height")) || 450;

  let pad = 24;
  let headerH = 64;
  let footerH = includeWatermark ? 44 : 16;
  let networkW = svgW;
  let heatmapW = 300;
  let contentH = Math.max(svgH, 380) + 40;

  let totalW = pad + networkW + 36 + heatmapW + pad;
  let totalH = headerH + contentH + footerH;

  let canvas = document.createElement("canvas");
  canvas.width = totalW * scale;
  canvas.height = totalH * scale;
  let ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);

  // Background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, totalW, totalH);

  // Header Bar
  ctx.fillStyle = "#183D4E";
  ctx.fillRect(0, 0, totalW, headerH);

  // Header Title
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 20px -apple-system, BlinkMacSystemFont, Roboto, sans-serif";
  ctx.fillText("EpochLab", pad, 30);

  ctx.fillStyle = "rgba(255, 255, 255, 0.72)";
  ctx.font = "13px -apple-system, BlinkMacSystemFont, Roboto, sans-serif";
  ctx.fillText("Neural Network Architecture & Decision Boundary", pad, 49);

  // Header Metadata Badges
  let metaItems = [
    `Dataset: ${datasetFormatted}`,
    `Activation: ${actKey.toUpperCase()}`,
    `Epoch: ${iter}`,
    `Loss: ${lossTest.toFixed(3)}`
  ];
  let metaStr = metaItems.join("  •  ");
  ctx.font = "500 12px -apple-system, BlinkMacSystemFont, Roboto, sans-serif";
  let metaW = ctx.measureText(metaStr).width;
  ctx.fillStyle = "rgba(255, 255, 255, 0.88)";
  ctx.fillText(metaStr, totalW - pad - metaW, 37);

  // Draw Network Architecture SVG
  let netX = pad;
  let netY = headerH + 16;

  try {
    let svgImg = await serializeSvgToImage(svgEl, svgW, svgH);
    ctx.drawImage(svgImg, netX, netY, svgW, svgH);
  } catch (err) {
    console.warn("Failed to render network SVG:", err);
  }

  // Draw each neuron's 30x30 canvas thumbnail
  let neuronDivs = document.querySelectorAll("#network .canvas");
  for (let i = 0; i < neuronDivs.length; i++) {
    let div = neuronDivs[i] as HTMLElement;
    let nCanvas = div.querySelector("canvas");
    if (nCanvas) {
      let l = parseFloat(div.style.left) || div.offsetLeft;
      let t = parseFloat(div.style.top) || div.offsetTop;
      let nx = netX + l;
      let ny = netY + t;
      let isInactive = div.classList.contains("inactive");

      ctx.save();
      ctx.globalAlpha = isInactive ? 0.35 : 1.0;
      ctx.drawImage(nCanvas, nx, ny, 30, 30);
      ctx.restore();

      ctx.strokeStyle = isInactive ? "#cccccc" : "#24292f";
      ctx.lineWidth = isInactive ? 1 : 1.5;
      ctx.strokeRect(nx, ny, 30, 30);
    }
  }

  // Draw Output Heatmap
  let hmX = netX + networkW + 36;
  let hmY = netY + 10;

  // Heatmap Section Header
  ctx.fillStyle = "#24292f";
  ctx.font = "bold 14px -apple-system, BlinkMacSystemFont, Roboto, sans-serif";
  ctx.fillText("Model Decision Boundary", hmX, hmY + 6);

  hmY += 20;

  // Background decision boundary
  if (heatmapCanvas) {
    ctx.drawImage(heatmapCanvas, hmX, hmY, 300, 300);
  } else {
    ctx.fillStyle = "#f6f8fa";
    ctx.fillRect(hmX, hmY, 300, 300);
  }

  // Data points overlay
  if (heatmapSvg) {
    try {
      let ptsImg = await serializeSvgToImage(heatmapSvg, 300, 300);
      ctx.drawImage(ptsImg, hmX, hmY, 300, 300);
    } catch (e) {
      console.warn("Failed to draw heatmap points SVG:", e);
    }
  }

  ctx.strokeStyle = "#d0d7de";
  ctx.lineWidth = 1;
  ctx.strokeRect(hmX, hmY, 300, 300);

  // Heatmap loss summary
  ctx.fillStyle = "#57606a";
  ctx.font = "12px -apple-system, BlinkMacSystemFont, Roboto, sans-serif";
  ctx.fillText(`Training Loss: ${lossTrain.toFixed(4)}`, hmX, hmY + 300 + 26);
  ctx.fillText(`Test Loss:       ${lossTest.toFixed(4)}`, hmX, hmY + 300 + 44);

  // Footer Watermark
  if (includeWatermark) {
    ctx.fillStyle = "#f6f8fa";
    ctx.fillRect(0, totalH - footerH, totalW, footerH);

    ctx.strokeStyle = "#e1e4e8";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, totalH - footerH);
    ctx.lineTo(totalW, totalH - footerH);
    ctx.stroke();

    ctx.fillStyle = "#0969da";
    ctx.font = "bold 12px -apple-system, BlinkMacSystemFont, Roboto, sans-serif";
    ctx.fillText("⚡ EpochLab", pad, totalH - 16);

    ctx.fillStyle = "#57606a";
    ctx.font = "12px -apple-system, BlinkMacSystemFont, Roboto, sans-serif";
    ctx.fillText("— Tinker with live Neural Networks in your browser at https://epochlab.org", pad + 72, totalH - 16);

    let shapeStr = `Shape: [${state.networkShape.join(", ")}]  |  LR: ${state.learningRate}`;
    ctx.font = "11px monospace, sans-serif";
    let shapeW = ctx.measureText(shapeStr).width;
    ctx.fillText(shapeStr, totalW - pad - shapeW, totalH - 16);
  }

  return canvas;
}

/**
 * Triggers PNG Export and download.
 */
export async function exportPNG(callbacks: ExportCallbacks, options: PngExportOptions = {}) {
  let state = callbacks.getState();
  let iter = callbacks.getIter();
  let datasetKey = state.problem === Problem.CLASSIFICATION ?
      getKeyFromValue(datasets, state.dataset) :
      getKeyFromValue(regDatasets, state.regDataset);

  callbacks.showToast("Rendering high-res PNG...");

  try {
    let canvas = await renderVisualizationToCanvas(callbacks, options);
    canvas.toBlob(blob => {
      if (!blob) {
        callbacks.showToast("Failed to generate PNG blob.");
        return;
      }
      let filename = `epochlab-${datasetKey || "network"}-epoch-${iter}.png`;
      downloadBlob(blob, filename);
      callbacks.showToast("PNG downloaded successfully!");
    }, "image/png");
  } catch (err) {
    console.error("Export PNG failed:", err);
    callbacks.showToast("Error generating PNG export.");
  }
}

/**
 * Serializes the full state, architecture, weights, and biases to JSON and downloads it.
 */
export function exportJSON(callbacks: ExportCallbacks) {
  let state = callbacks.getState();
  let network = callbacks.getNetwork();
  let iter = callbacks.getIter();
  let lossTrain = callbacks.getLossTrain();
  let lossTest = callbacks.getLossTest();

  let datasetKey = state.problem === Problem.CLASSIFICATION ?
      getKeyFromValue(datasets, state.dataset) :
      getKeyFromValue(regDatasets, state.regDataset);
  let actKey = getKeyFromValue(activations, state.activation) || "tanh";
  let regKey = getKeyFromValue(regularizations, state.regularization) || "none";
  let probKey = getKeyFromValue(problems, state.problem) || "classification";

  // Biases for all nodes
  let biases: {[nodeId: string]: number} = {};
  if (network) {
    nn.forEachNode(network, true, node => {
      biases[node.id] = node.bias;
    });
  }

  // Detailed links
  let links: {source: string, dest: string, weight: number}[] = [];
  if (network) {
    for (let layerIdx = 1; layerIdx < network.length; layerIdx++) {
      for (let node of network[layerIdx]) {
        for (let link of node.inputLinks) {
          links.push({
            source: link.source.id,
            dest: link.dest.id,
            weight: link.weight
          });
        }
      }
    }
  }

  // State serializable clone
  let stateObj: {[key: string]: any} = {};
  for (let key in state) {
    if (typeof state[key] !== "function" && key !== "hiddenLayerControls") {
      stateObj[key] = state[key];
    }
  }
  stateObj["datasetKey"] = datasetKey;
  stateObj["activationKey"] = actKey;
  stateObj["regularizationKey"] = regKey;
  stateObj["problemKey"] = probKey;

  let config = {
    app: "EpochLab",
    version: "2026.1",
    exportedAt: new Date().toISOString(),
    metadata: {
      dataset: datasetKey,
      problem: probKey,
      activation: actKey,
      regularization: regKey,
      epoch: iter,
      trainLoss: lossTrain,
      testLoss: lossTest,
      networkShape: state.networkShape.slice()
    },
    state: stateObj,
    weights: network ? callbacks.getOutputWeights(network) : [],
    biases: biases,
    links: links
  };

  let jsonStr = JSON.stringify(config, null, 2);
  let blob = new Blob([jsonStr], { type: "application/json" });
  let filename = `epochlab-${datasetKey || "model"}-epoch-${iter}.json`;
  downloadBlob(blob, filename);
  callbacks.showToast("Model JSON configuration downloaded!");
}

/**
 * Imports a JSON file, deserializing state, architecture, weights, and biases.
 */
export function importJSON(file: File, callbacks: ExportCallbacks): Promise<void> {
  return new Promise((resolve, reject) => {
    let reader = new FileReader();
    reader.onload = (e) => {
      try {
        let content = (e.target as FileReader).result as string;
        let config = JSON.parse(content);

        if (!config || (!config.state && !config.weights)) {
          throw new Error("Invalid EpochLab JSON configuration file.");
        }

        callbacks.pausePlayer();

        let state = callbacks.getState();
        let rawState = config.state || {};

        // Restore problem
        if (rawState.problemKey && problems[rawState.problemKey] !== undefined) {
          state.problem = problems[rawState.problemKey];
        }

        // Restore dataset
        if (rawState.datasetKey) {
          if (state.problem === Problem.CLASSIFICATION && datasets[rawState.datasetKey]) {
            state.dataset = datasets[rawState.datasetKey];
          } else if (state.problem === Problem.REGRESSION && regDatasets[rawState.datasetKey]) {
            state.regDataset = regDatasets[rawState.datasetKey];
          }
        }

        // Restore activation
        if (rawState.activationKey && activations[rawState.activationKey]) {
          state.activation = activations[rawState.activationKey];
        }

        // Restore regularization
        if (rawState.regularizationKey && regularizations[rawState.regularizationKey] !== undefined) {
          state.regularization = regularizations[rawState.regularizationKey];
        }

        // Restore scalar numeric hyperparameters
        if (typeof rawState.learningRate === "number") state.learningRate = rawState.learningRate;
        if (typeof rawState.regularizationRate === "number") state.regularizationRate = rawState.regularizationRate;
        if (typeof rawState.noise === "number") state.noise = rawState.noise;
        if (typeof rawState.batchSize === "number") state.batchSize = rawState.batchSize;
        if (typeof rawState.percTrainData === "number") state.percTrainData = rawState.percTrainData;

        // Restore booleans
        if (typeof rawState.showTestData === "boolean") state.showTestData = rawState.showTestData;
        if (typeof rawState.discretize === "boolean") state.discretize = rawState.discretize;

        // Restore inputs
        ["x", "y", "xTimesY", "xSquared", "ySquared", "cosX", "sinX", "cosY", "sinY"].forEach(inputKey => {
          if (typeof rawState[inputKey] === "boolean") {
            state[inputKey] = rawState[inputKey];
          }
        });

        // Restore network architecture
        let newShape = config.metadata && Array.isArray(config.metadata.networkShape) ?
            config.metadata.networkShape :
            (Array.isArray(rawState.networkShape) ? rawState.networkShape : state.networkShape);

        state.networkShape = newShape.slice();
        state.numHiddenLayers = state.networkShape.length;

        // Trigger network rebuild and weight/bias restoration
        callbacks.rebuildNetworkAndUI(state, config.weights, config.biases, config.links);
        callbacks.showToast("Model & weights imported successfully!");
        resolve();
      } catch (err) {
        console.error("Failed to import JSON:", err);
        callbacks.showToast("Failed to parse JSON model file.");
        reject(err);
      }
    };
    reader.onerror = () => {
      callbacks.showToast("Error reading file.");
      reject(new Error("File read error"));
    };
    reader.readAsText(file);
  });
}

/**
 * GIF Recording Controller
 * Manages frame capture during live training and encodes to GIF with a watermark.
 */
export class GifRecordingController {
  private isRecording = false;
  private isEncoding = false;
  private options: GifRecordingOptions = {};
  private encoder: GifEncoder = null;
  private callbacks: ExportCallbacks;
  private frameCount = 0;
  private offscreenCanvas: HTMLCanvasElement;
  private offscreenCtx: CanvasRenderingContext2D;
  private recordingBadge: HTMLElement = null;

  constructor(callbacks: ExportCallbacks) {
    this.callbacks = callbacks;
    this.offscreenCanvas = document.createElement("canvas");
    this.offscreenCtx = this.offscreenCanvas.getContext("2d");
  }

  isCurrentlyRecording(): boolean {
    return this.isRecording;
  }

  startRecording(options: GifRecordingOptions = {}) {
    if (this.isRecording || this.isEncoding) return;

    this.options = {
      mode: options.mode || "heatmap",
      frameInterval: options.frameInterval || 2,
      maxFrames: options.maxFrames || 35,
      fps: options.fps || 12
    };

    let w = this.options.mode === "full" ? 540 : 340;
    let h = this.options.mode === "full" ? 360 : 380;
    this.offscreenCanvas.width = w;
    this.offscreenCanvas.height = h;

    this.encoder = new GifEncoder(w, h);
    this.frameCount = 0;
    this.isRecording = true;

    this.showRecordingBadge();
    this.callbacks.showToast("🔴 GIF recording started! Capturing training frames...");

    // Start training if not running
    if (!this.callbacks.isPlayerPlaying()) {
      this.callbacks.playPlayer();
    }
  }

  /**
   * Called inside oneStep() during training.
   */
  captureFrameIfActive() {
    if (!this.isRecording || this.isEncoding) return;

    let iter = this.callbacks.getIter();
    if (iter % (this.options.frameInterval || 2) !== 0) return;

    this.captureCurrentFrame();
    this.frameCount++;
    this.updateRecordingBadge();

    if (this.frameCount >= (this.options.maxFrames || 35)) {
      this.stopAndExport();
    }
  }

  private captureCurrentFrame() {
    let w = this.offscreenCanvas.width;
    let h = this.offscreenCanvas.height;
    let ctx = this.offscreenCtx;

    let iter = this.callbacks.getIter();
    let lossTrain = this.callbacks.getLossTrain();
    let state = this.callbacks.getState();

    let datasetKey = state.problem === Problem.CLASSIFICATION ?
        getKeyFromValue(datasets, state.dataset) :
        getKeyFromValue(regDatasets, state.regDataset);

    // Background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);

    let heatmapContainer = document.querySelector("#heatmap");
    let heatmapCanvas = heatmapContainer ? heatmapContainer.querySelector("canvas") : null;
    let heatmapSvg = heatmapContainer ? heatmapContainer.querySelector("svg") : null;

    if (this.options.mode === "heatmap") {
      // Header
      ctx.fillStyle = "#183D4E";
      ctx.fillRect(0, 0, w, 32);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 13px -apple-system, BlinkMacSystemFont, Roboto, sans-serif";
      ctx.fillText("EpochLab", 10, 21);

      ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
      ctx.font = "11px monospace, sans-serif";
      ctx.fillText(`Epoch ${iter}  |  Loss: ${lossTrain.toFixed(3)}`, w - 165, 21);

      // Decision boundary
      let hmX = (w - 300) / 2;
      let hmY = 40;

      if (heatmapCanvas) {
        ctx.drawImage(heatmapCanvas, hmX, hmY, 300, 300);
      }

      // Draw SVG points onto canvas
      if (heatmapSvg) {
        let circles = heatmapSvg.querySelectorAll("circle");
        for (let i = 0; i < circles.length; i++) {
          let c = circles[i] as SVGCircleElement;
          let cx = parseFloat(c.getAttribute("cx") || "0");
          let cy = parseFloat(c.getAttribute("cy") || "0");
          let r = parseFloat(c.getAttribute("r") || "2.5");
          let fill = c.style.fill || c.getAttribute("fill") || "#0877bd";

          ctx.fillStyle = fill;
          ctx.beginPath();
          ctx.arc(hmX + cx, hmY + cy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.strokeStyle = "#d0d7de";
      ctx.lineWidth = 1;
      ctx.strokeRect(hmX, hmY, 300, 300);

      // Watermark Footer
      ctx.fillStyle = "#f6f8fa";
      ctx.fillRect(0, h - 28, w, 28);
      ctx.strokeStyle = "#e1e4e8";
      ctx.beginPath();
      ctx.moveTo(0, h - 28);
      ctx.lineTo(w, h - 28);
      ctx.stroke();

      ctx.fillStyle = "#0969da";
      ctx.font = "bold 11px -apple-system, BlinkMacSystemFont, Roboto, sans-serif";
      ctx.fillText("⚡ EpochLab • epochlab.org", 10, h - 10);
    } else {
      // Full view simplified for GIF frame
      ctx.fillStyle = "#183D4E";
      ctx.fillRect(0, 0, w, 32);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 13px -apple-system, BlinkMacSystemFont, Roboto, sans-serif";
      ctx.fillText("EpochLab Training", 10, 21);

      ctx.font = "11px monospace, sans-serif";
      ctx.fillText(`Epoch ${iter}  Loss: ${lossTrain.toFixed(3)}`, w - 175, 21);

      // Left: SVG preview or simplified network
      let svgEl = document.querySelector("#svg") as SVGSVGElement;
      if (svgEl) {
        let svgW = svgEl.clientWidth || 500;
        let svgH = svgEl.clientHeight || 400;
        let scaleNet = Math.min(220 / svgW, 280 / svgH);
        // Draw thumbnail canvases
        let neuronDivs = document.querySelectorAll("#network .canvas");
        for (let i = 0; i < neuronDivs.length; i++) {
          let div = neuronDivs[i] as HTMLElement;
          let nCanvas = div.querySelector("canvas");
          if (nCanvas) {
            let l = (parseFloat(div.style.left) || div.offsetLeft) * scaleNet;
            let t = (parseFloat(div.style.top) || div.offsetTop) * scaleNet;
            ctx.drawImage(nCanvas, 10 + l, 40 + t, 30 * scaleNet, 30 * scaleNet);
          }
        }
      }

      // Right: Heatmap
      let hmX = w - 280;
      let hmY = 40;
      if (heatmapCanvas) {
        ctx.drawImage(heatmapCanvas, hmX, hmY, 260, 260);
      }
      ctx.strokeStyle = "#d0d7de";
      ctx.strokeRect(hmX, hmY, 260, 260);

      // Watermark Footer
      ctx.fillStyle = "#f6f8fa";
      ctx.fillRect(0, h - 28, w, 28);
      ctx.fillStyle = "#0969da";
      ctx.font = "bold 11px -apple-system, BlinkMacSystemFont, Roboto, sans-serif";
      ctx.fillText("⚡ EpochLab • Interactive Neural Lab • epochlab.org", 10, h - 10);
    }

    let delayMs = Math.round(1000 / (this.options.fps || 12));
    let imgData = ctx.getImageData(0, 0, w, h);
    this.encoder.addFrame(imgData, delayMs);
  }

  stopAndExport() {
    if (!this.isRecording) return;
    this.isRecording = false;
    this.isEncoding = true;

    this.callbacks.pausePlayer();
    this.updateRecordingBadge(true);
    this.callbacks.showToast("Assembling GIF animation with LZW compression...");

    let state = this.callbacks.getState();
    let iter = this.callbacks.getIter();
    let datasetKey = state.problem === Problem.CLASSIFICATION ?
        getKeyFromValue(datasets, state.dataset) :
        getKeyFromValue(regDatasets, state.regDataset);

    this.encoder.encode(progress => {
      this.updateProgressBadge(progress);
    }).then(blob => {
      let filename = `epochlab-training-${datasetKey || "model"}-epoch-${iter}.gif`;
      downloadBlob(blob, filename);
      this.isEncoding = false;
      this.removeRecordingBadge();
      this.callbacks.showToast("Training GIF exported successfully!");
    }).catch(err => {
      console.error("GIF encoding error:", err);
      this.isEncoding = false;
      this.removeRecordingBadge();
      this.callbacks.showToast("Failed to encode GIF.");
    });
  }

  cancelRecording() {
    this.isRecording = false;
    this.isEncoding = false;
    if (this.encoder) this.encoder.clear();
    this.removeRecordingBadge();
    this.callbacks.showToast("GIF recording cancelled.");
  }

  private showRecordingBadge() {
    if (this.recordingBadge) this.recordingBadge.remove();

    this.recordingBadge = document.createElement("div");
    this.recordingBadge.className = "tronlab-rec-badge";
    this.recordingBadge.innerHTML = `
      <div class="rec-dot"></div>
      <span class="rec-status">Recording GIF: Frame 0 / ${this.options.maxFrames || 35}</span>
      <button class="rec-finish-btn basic-button">Finish & Download</button>
      <button class="rec-cancel-btn mdl-button mdl-js-button mdl-button--icon"><i class="material-icons">close</i></button>
    `;

    document.body.appendChild(this.recordingBadge);

    this.recordingBadge.querySelector(".rec-finish-btn").addEventListener("click", () => {
      this.stopAndExport();
    });

    this.recordingBadge.querySelector(".rec-cancel-btn").addEventListener("click", () => {
      this.cancelRecording();
    });
  }

  private updateRecordingBadge(isEncoding = false) {
    if (!this.recordingBadge) return;
    let statusEl = this.recordingBadge.querySelector(".rec-status");
    if (isEncoding) {
      if (statusEl) statusEl.textContent = `Encoding GIF: 0%...`;
      let btn = this.recordingBadge.querySelector(".rec-finish-btn") as HTMLButtonElement;
      if (btn) btn.disabled = true;
    } else {
      let maxF = this.options.maxFrames || 35;
      if (statusEl) statusEl.textContent = `Recording GIF: Frame ${this.frameCount} / ${maxF}`;
    }
  }

  private updateProgressBadge(pct: number) {
    if (!this.recordingBadge) return;
    let statusEl = this.recordingBadge.querySelector(".rec-status");
    if (statusEl) statusEl.textContent = `Encoding GIF: ${pct}%...`;
  }

  private removeRecordingBadge() {
    if (this.recordingBadge) {
      this.recordingBadge.remove();
      this.recordingBadge = null;
    }
  }
}
