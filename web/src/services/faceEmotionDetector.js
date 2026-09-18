// web/src/services/faceEmotionDetector.js
// Real-time facial expression & stress analyzer.
//
// This is a hand-written optical heuristic over downscaled frame luminance and
// edge energy — not a trained model. It reads brow shadow for tension, mouth
// region brightness for affect, and overall luminance/edge density for fatigue.
//
// Confidence is computed from threshold margin (see confidenceFromMargin). It
// used to be a hardcoded constant per branch, which overstated certainty for a
// heuristic with no trained parameters and no face-presence check.

// Sampling cadence. Deliberately throttled: the pixel loop is synchronous, so
// running it per animation frame pegs a core and stalls UI paint. Emotional
// state does not change meaningfully faster than this anyway.
export const ANALYSIS_INTERVAL_MS = 500; // 2 fps

// Confidence is derived from how far the frame cleared the deciding threshold,
// mirroring the margin-based construction used by the text classifier. These
// are trust margins over hand-tuned rules, not calibrated posteriors, so the
// ceiling is deliberately 0.90 rather than the near-certainty the previous
// hardcoded constants implied.
const CONF_FLOOR = 0.55;
const CONF_CEIL = 0.90;

// Below this horizontal-gradient density the frame carries no discernible
// facial structure at all — a blank wall, a covered lens, or a badly
// underexposed room all land here. The estimator has no face-presence check,
// so this is the only signal we have that there may be nothing to read. We
// report the frame as low-signal rather than emitting confident fatigue, on
// the same principle that the server records `unscored` instead of guessing.
const LOW_SIGNAL_EDGE_DENSITY = 2.0;
const LOW_SIGNAL_CONFIDENCE = 0.3;

export function confidenceFromMargin(margin) {
  const d = Math.min(1, Math.max(0, Number.isFinite(margin) ? margin : 0));
  return Number((CONF_FLOOR + (CONF_CEIL - CONF_FLOOR) * d).toFixed(3));
}

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

    // Mid-face reference: the crop minus both the brow and mouth bands (roughly
    // cheeks and nose). Both expression ratios are normalised against this
    // rather than against the global mean.
    //
    // Normalising by the global mean coupled the two ratios, because the global
    // mean contains both bands: brightening the mouth raised it, which dragged
    // browContrastRatio below the `>= 0.95` gate on the 'happy' branch and
    // reverted a broad smile to 'calm'. Excluding both bands from the reference
    // makes each ratio independent of the other region's luminance.
    const neutralPixels = skinPixelCount - browPixels - mouthPixels;
    const avgNeutralLum = neutralPixels > 0
      ? (totalLuminance - browRegionLuminance - mouthRegionLuminance) / neutralPixels
      : avgLum;

    // 2. Classify Expression based on Optical Contrast Signatures
    // Brow furrowing reduces brow luminance due to shadow creasing
    const browContrastRatio = avgBrowLum / (avgNeutralLum + 1);
    const mouthContrastRatio = avgMouthLum / (avgNeutralLum + 1);

    let detectedEmotion = 'calm';
    let tension = 18;
    let fatigue = 22;
    let valence = 80;
    let decisiveness = 0;

    // Detect tension / frowning: Brow shadow increases + high edge density
    if (browContrastRatio < 0.88 || edgeDensity > 18) {
      detectedEmotion = 'stressed';
      tension = Math.min(92, Math.round(55 + (1 - browContrastRatio) * 100));
      valence = 35;
      // Either predicate can fire; decisiveness is whichever cleared by more.
      decisiveness = Math.max(
        (0.88 - browContrastRatio) / 0.12,
        (edgeDensity - 18) / 18,
      );
    }
    // Detect smiling / happy: Mouth aperture brightness + relaxed brow
    else if (mouthContrastRatio > 1.08 && browContrastRatio >= 0.95) {
      detectedEmotion = 'happy';
      tension = 12;
      valence = 92;
      // Both predicates must hold, so the weaker margin bounds our certainty.
      decisiveness = Math.min(
        (mouthContrastRatio - 1.08) / 0.12,
        (browContrastRatio - 0.95) / 0.05,
      );
    }
    // Detect fatigue / low energy
    else if (avgLum < 75 || edgeDensity < 6) {
      detectedEmotion = 'fatigued';
      fatigue = 78;
      tension = 42;
      valence = 45;
      decisiveness = Math.max((75 - avgLum) / 75, (6 - edgeDensity) / 6);
    }
    // Calm baseline
    else {
      detectedEmotion = 'calm';
      tension = 16;
      fatigue = 20;
      valence = 84;
      // Calm is the fall-through: certainty is the distance to the nearest
      // boundary we did NOT cross.
      decisiveness = Math.min(
        (browContrastRatio - 0.88) / 0.12,
        (18 - edgeDensity) / 18,
        (avgLum - 75) / 75,
      );
    }

    // A frame with no structure cannot support a confident reading, whichever
    // branch the thresholds happened to select.
    const lowSignal = edgeDensity < LOW_SIGNAL_EDGE_DENSITY;
    const confidence = lowSignal
      ? LOW_SIGNAL_CONFIDENCE
      : confidenceFromMargin(decisiveness);

    return {
      emotion: detectedEmotion,
      tension,
      fatigue,
      valence,
      confidence,
      lowSignal,
      timestamp: Date.now(),
    };
  }
}

export const faceAnalyzer = new FaceEmotionAnalyzer();
