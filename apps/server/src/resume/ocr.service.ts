import { Injectable, Logger } from "@nestjs/common";

/**
 * OCR Service
 * - Uses Tesseract.js by default for on-server OCR of images.
 * - This service is intentionally small and pluggable so a cloud provider (Google Vision)
 *   can be swapped in by implementing the same interface and wiring via DI.
 *
 * Notes:
 * - For large/production workloads it's recommended to delegate OCR to a managed service
 *   (e.g., Google Vision API) and only use this as a fallback or local dev option.
 * - Configure a GOOGLE_VISION_API_KEY or OCR_URL and add a provider if you want to
 *   offload OCR to an external API.
 */
@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);

  async recognizeImageBuffer(buffer: Buffer, lang = "eng"): Promise<string> {
    this.logger.log("Starting OCR recognition (tesseract.js)");
    try {
      // Try to require tesseract.js explicitly. Using a literal require in a try/catch
      // prevents webpack from emitting a critical dependency warning.
      let Tesseract: any | undefined;
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        Tesseract = require("tesseract.js");
      } catch (e) {
        this.logger.warn("tesseract.js not installed - OCR disabled");
        return "";
      }

      const { data } = await Tesseract.recognize(buffer, lang, { logger: (m: any) => this.logger.debug(String(m)) });
      return data?.text ?? "";
    } catch (error) {
      this.logger.warn("Tesseract OCR failed, returning empty string", (error as Error).message);
      return "";
    }
  }
}
