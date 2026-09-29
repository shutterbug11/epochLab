# EpochLab

An interactive, browser-based neural network laboratory and visualization sandbox. **EpochLab** allows you to design, train, and inspect feedforward deep neural networks directly in your browser with real-time feedback—requiring no external backend, GPUs, or Python environment.

---

## Features

- **Real-Time Interactive Training**: Watch weights update, gradients backpropagate, and decision boundaries evolve frame-by-frame.
- **Comprehensive Educational Guide ("Inside a Neural Network")**: In-depth visual article mounted directly below the playground covering network foundations, artificial neuron mechanics, feature spaces, training loops & backpropagation, guided experiments, generalization, and architecture families.
- **Customizable Architectures**:
  - Dynamically add or remove hidden layers (up to 6 hidden layers).
  - Configure neuron counts per layer (1 to 8 neurons).
- **Engineered Input Features**:
  - Raw coordinates: $X_1$, $X_2$
  - Polynomial features: $X_1^2$, $X_2^2$, $X_1X_2$
  - Trigonometric projections: $\sin(X_1)$, $\sin(X_2)$
- **Hyperparameter Controls**:
  - **Learning Rates**: Ranging from 0.00001 to 10
  - **Activation Functions**: ReLU, Tanh, Sigmoid, Linear
  - **Regularization**: None, L1 (Lasso), L2 (Ridge) with customizable penalty rates
  - **Batch Sizing**: Batch sizes from 1 to 30
- **Versatile Synthetic Datasets**:
  - **Classification**: Circle, Exclusive OR (XOR), Multi-cluster Gaussian, and Concentric Spiral.
  - **Regression**: Continuous Plane and Multi-Gaussian distributions.
  - **Noise & Data Splits**: Adjustable Gaussian noise and customizable training/test ratio percentages.
- **Live Visual Analytics**:
  - High-resolution decision boundary and activation heatmaps rendered on HTML5 Canvas.
  - Real-time D3 loss chart tracking training error vs. test generalization error simultaneously.
- **Sharable Experiment States & Export Studio**:
  - Full application state serializes directly to URL hash for instant sharing and reproducible benchmarks.
  - High-resolution PNG and animated GIF export with custom model statistics and watermarks.

---

## Architecture & Codebase Overview

EpochLab is structured as a modular TypeScript & web application:

| Source File | Description |
| :--- | :--- |
| [`src/nn.ts`](src/nn.ts) | Core neural network engine. Implements `Node`, `Link`, forward propagation, backpropagation, activation functions, regularizers, and loss calculation. |
| [`src/playground.ts`](src/playground.ts) | Main simulation loop and UI controller. Handles user events, SVG neural link rendering, node heatmaps, and requestAnimationFrame stepping. |
| [`src/dataset.ts`](src/dataset.ts) | Mathematical generators for 2D synthetic datasets, sampling distributions, Gaussian noise generation, and array shuffling. |
| [`src/heatmap.ts`](src/heatmap.ts) | HTML5 Canvas-based boundary renderer for individual hidden neuron representations and overall network prediction fields. |
| [`src/linechart.ts`](src/linechart.ts) | D3.js real-time dual-line plot for tracking training loss and test loss across training epochs. |
| [`src/state.ts`](src/state.ts) | State management engine that synchronizes and parses the URL hash state. |
| [`src/export.ts`](src/export.ts) | Export & Download Studio for high-resolution PNG generation, animated GIF recording, and JSON config export. |
| [`blog-section.html`](blog-section.html) | Standalone educational article fragment with semantic headings, inline SVGs, tables, experiment cards, and references. |
| [`blog.css`](blog.css) | Scoped responsive stylesheet for `.epochs-article` supporting system themes, dark mode overrides, and mobile viewports. |

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+ recommended)
- `npm` (v9+)

### Installation

Clone or open the project folder in your terminal, then install dependencies:

```bash
npm install --legacy-peer-deps
```

### Build

Compile the TypeScript source, styles, and bundle files into the `dist/` directory:

```bash
npm run build
```

This runs the compilation pipeline:
- `prep`: Copies vendor libraries and scripts
- `build-js`: Bundles and minifies TypeScript using Browserify, Tsify, and UglifyJS
- `build-css`: Merges Material Design Lite styles with project CSS
- `build-html`: Copies the layout into `dist/`

### Running the App Locally

To start a local static server:

```bash
npm run serve
```

Or run directly via `npx serve`:

```bash
npx serve -l 8080 dist
```

Open your browser and navigate to:
```
http://localhost:8080
```

### Development Mode

For rapid development with auto-recompile on file changes:

```bash
npm run serve-watch
```

---

## Keyboard & Mouse Shortcuts

- **Spacebar / Play Button**: Toggle training simulation run/pause
- **Step Button**: Advance training by exactly one batch iteration
- **Reset Button**: Reset network weights to initial random state and clear epoch counter
- **Hover on Weights**: Hover over any connecting line between neurons to see its current weight value or click to manually adjust weight values
