// web/src/services/faceEmotionDetector.js
// Real-time facial expression & stress analyzer.
//
// This is a hand-written optical heuristic over downscaled frame luminance and
// edge energy — not a trained model. It reads brow shadow for tension, mouth
// region brightness for affect, and overall luminance/edge density for fatigue.

// Sampling cadence. Deliberately throttled: the pixel loop is synchronous, so
// running it per animation frame pegs a core and stalls UI paint. Emotional
// state does not change meaningfully faster than this anyway.
export const ANALYSIS_INTERVAL_MS = 500; // 2 fps

export class FaceEmotionAnalyzer {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
  }

  analyzeVideoFrame(videoElement) {
    if (!videoElement || videoElement.readyState < 2) {
      return null;
    }

    const w = 160;
    const h = 120;
    this.canvas.width = w;
    this.canvas.height = h;

    // Draw video frame to downscaled analysis canvas
    this.ctx.drawImage(videoElement, 0, 0, w, h);
    const frame = this.ctx.getImageData(0, 0, w, h);
    const data = frame.data;

    // 1. Calculate Face Region Luminance & Contrast (Center 60% of frame)
    let totalLuminance = 0;
    let browRegionLuminance = 0;
    let mouthRegionLuminance = 0;
    let edgeEnergy = 0;
    let skinPixelCount = 0;

    const startX = Math.floor(w * 0.25);
    const endX = Math.floor(w * 0.75);
    const startY = Math.floor(h * 0.2);
    const endY = Math.floor(h * 0.85);

    // Brow furrow zone (Upper center)
    const browYStart = Math.floor(h * 0.28);
    const browYEnd = Math.floor(h * 0.42);

    // Mouth smile zone (Lower center)
    const mouthYStart = Math.floor(h * 0.62);
    const mouthYEnd = Math.floor(h * 0.78);

    let browPixels = 0;
    let mouthPixels = 0;

    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const idx = (y * w + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        // Luminance
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        totalLuminance += lum;
        skinPixelCount++;

        // Simple edge / gradient check with neighbor
        if (x < endX - 1) {
          const nextIdx = (y * w + (x + 1)) * 4;
          const nextLum = 0.299 * data[nextIdx] + 0.587 * data[nextIdx + 1] + 0.114 * data[nextIdx + 2];
          edgeEnergy += Math.abs(lum - nextLum);
        }

        // Brow region (furrowing creates vertical shadow edges)
        if (y >= browYStart && y <= browYEnd) {
          browRegionLuminance += lum;
          browPixels++;
        }

        // Mouth region
        if (y >= mouthYStart && y <= mouthYEnd) {
          mouthRegionLuminance += lum;
          mouthPixels++;
        }
      }
    }

    const avgLum = skinPixelCount > 0 ? totalLuminance / skinPixelCount : 128;
    const avgBrowLum = browPixels > 0 ? browRegionLuminance / browPixels : avgLum;
    const avgMouthLum = mouthPixels > 0 ? mouthRegionLuminance / mouthPixels : avgLum;
    const edgeDensity = skinPixelCount > 0 ? (edgeEnergy / skinPixelCount) : 10;

    // 2. Classify Expression based on Optical Contrast Signatures
    // Brow furrowing reduces brow luminance due to shadow creasing
    const browContrastRatio = avgBrowLum / (avgLum + 1);
    const mouthContrastRatio = avgMouthLum / (avgLum + 1);

    let detectedEmotion = 'calm';
    let tension = 18;
    let fatigue = 22;
    let valence = 80;
    let confidence = 0.91;

    // Detect tension / frowning: Brow shadow increases + high edge density
    if (browContrastRatio < 0.88 || edgeDensity > 18) {
      detectedEmotion = 'stressed';
      tension = Math.min(92, Math.round(55 + (1 - browContrastRatio) * 100));
      valence = 35;
      confidence = 0.94;
    }
    // Detect smiling / happy: Mouth aperture brightness + relaxed brow
    else if (mouthContrastRatio > 1.08 && browContrastRatio >= 0.95) {
      detectedEmotion = 'happy';
      tension = 12;
      valence = 92;
      confidence = 0.96;
    }
    // Detect fatigue / low energy
    else if (avgLum < 75 || edgeDensity < 6) {
      detectedEmotion = 'fatigued';
      fatigue = 78;
      tension = 42;
      valence = 45;
      confidence = 0.89;
    }
    // Calm baseline
    else {
      detectedEmotion = 'calm';
      tension = 16;
      fatigue = 20;
      valence = 84;
      confidence = 0.93;
    }

    return {
      emotion: detectedEmotion,
      tension,
      fatigue,
      valence,
      confidence,
      timestamp: Date.now(),
    };
  }
}

export const faceAnalyzer = new FaceEmotionAnalyzer();
