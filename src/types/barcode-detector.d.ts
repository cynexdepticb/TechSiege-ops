/**
 * Ambient types for browser APIs that aren't in TypeScript's default DOM lib.
 */

interface DetectedBarcode {
  rawValue: string;
  format: string;
  boundingBox: DOMRectReadOnly;
  cornerPoints: { x: number; y: number }[];
}

interface DetectedBarcodeOptions {
  formats?: string[];
}

declare class BarcodeDetector {
  constructor(options?: DetectedBarcodeOptions);
  static getSupportedFormats(): Promise<string[]>;
  detect(source: ImageBitmapSource): Promise<DetectedBarcode[]>;
}
