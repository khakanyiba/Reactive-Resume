import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { CreateResumeDto, ImportResumeDto, ResumeDto, UpdateResumeDto } from "@reactive-resume/dto";
import { defaultResumeData, ResumeData } from "@reactive-resume/schema";
import type { DeepPartial } from "@reactive-resume/utils";
import { ErrorMessage, generateRandomName } from "@reactive-resume/utils";
import slugify from "@sindresorhus/slugify";
import deepmerge from "deepmerge";
import { PrismaService } from "nestjs-prisma";

import { PrinterService } from "@/server/printer/printer.service";
import { OcrService } from "./ocr.service";

import { StorageService } from "../storage/storage.service";

@Injectable()
export class ResumeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly printerService: PrinterService,
    private readonly storageService: StorageService,
    private readonly ocrService: OcrService,
  ) {}

  async create(userId: string, createResumeDto: CreateResumeDto) {
    const { name, email, picture } = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { name: true, email: true, picture: true },
    });

    const data = deepmerge(defaultResumeData, {
      basics: { name, email, picture: { url: picture ?? "" } },
    } satisfies DeepPartial<ResumeData>);

    return this.prisma.resume.create({
      data: {
        data,
        userId,
        title: createResumeDto.title,
        visibility: createResumeDto.visibility,
        slug: createResumeDto.slug ?? slugify(createResumeDto.title),
      },
    });
  }

  async import(userId: string, importResumeDto: ImportResumeDto) {
    const randomTitle = generateRandomName();
    const slug = slugify(importResumeDto.title ?? randomTitle);

    return await this.prisma.resume.create({
        data: {
          userId,
          visibility: "private",
          data: importResumeDto.data,
          title: importResumeDto.title ?? randomTitle,
          slug,
        },
      });
  }

  async importFromFile(userId: string, file: Express.Multer.File) {
    const mime = file.mimetype.toLowerCase();
    Logger.log(`Processing uploaded file: ${file.originalname} (${mime})`);

    let text = "";

    if (mime.includes("pdf")) {
      Logger.log("Extracting text from PDF...");

      // Try to require pdf-parse and handle CJS/ESM shapes
      let pdfParseFunc: ((buffer: Buffer) => Promise<any>) | null = null;
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const _pdfParse = require("pdf-parse");
        pdfParseFunc = typeof _pdfParse === "function" ? _pdfParse : (_pdfParse && typeof _pdfParse.default === "function" ? _pdfParse.default : null);
      } catch (e1) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const _pdfParse = require("pdf-parse/lib/pdf-parse.js");
          pdfParseFunc = typeof _pdfParse === "function" ? _pdfParse : null;
        } catch (e2) {
          Logger.warn("pdf-parse not available via standard paths");
          pdfParseFunc = null;
        }
      }

      if (pdfParseFunc) {
        try {
          const result = await pdfParseFunc(file.buffer);
          text = result?.text ?? "";
          Logger.log(`PDF text extraction completed. Extracted ${text.length} characters.`);
        } catch (err) {
          Logger.error("pdf-parse invocation failed:", err);
          text = "";
        }
      } else {
        Logger.warn("pdf-parse not installed or couldn't be resolved; skipping pdf-parse step");
      }

      // Fallback to OCR for scanned PDFs with no extractable text
      if (!text || text.trim().length < 20) {
        Logger.log("PDF has little extractable text, attempting OCR fallback (local Tesseract)...");
        try {
          const ocrText = await this.ocrPdfBuffer(file.buffer);
          if (ocrText) {
            text = ocrText;
            Logger.log(`OCR fallback extracted ${text.length} characters.`);
          }
        } catch (ocrErr) {
          Logger.warn("OCR fallback failed:", ocrErr);
        }
      }
    } else if (mime.includes("word") || mime.includes("officedocument")) {
      Logger.log("Extracting text from Word document...");
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mammoth = require("mammoth");
        const result = await mammoth.extractRawText({ buffer: file.buffer });
        text = result?.value ?? "";
        Logger.log(`Word document text extraction completed. Extracted ${text.length} characters.`);
      } catch (err) {
        Logger.error("Word document parsing failed:", err);
        throw new BadRequestException("Failed to parse Word document. Please ensure it's a valid .docx file.");
      }
    } else if (mime.startsWith("image/")) {
      Logger.log("Running OCR on uploaded image...");
      try {
        const ocrText = await this.ocrService.recognizeImageBuffer(file.buffer);
        text = ocrText ?? "";
        Logger.log(`Image OCR completed. Extracted ${text.length} characters.`);
      } catch (err) {
        Logger.error("Image OCR failed:", err);
        throw new BadRequestException("Failed to OCR the uploaded image.");
      }
    } else {
      throw new BadRequestException(
        "Unsupported file. Please upload a PDF (.pdf), Word document (.docx) or image.",
      );
    }

    if (!text || !text.trim()) {
      Logger.error("No extractable text found after parsing and OCR fallback");
      throw new BadRequestException("Failed to extract text from the provided file. Please try a different file or enable OCR.");
    }

    const summary = text.trim().split(/\n{2,}/)[0]?.slice(0, 1200) ?? "Imported resume";
    const randomTitle = generateRandomName();

  // Use the original filename without extension as the title
  const baseTitle = file.originalname.replace(/\.[^/.]+$/, "");
  
  // Find a unique title/slug combination
  let title = baseTitle;
  let counter = 1;
  let slug = slugify(title);
  
  while (true) {
    try {
      const exists = await this.prisma.resume.findFirst({
        where: { userId, slug },
      });
      
      if (!exists) break;
      
      title = `${baseTitle} (${counter})`;
      slug = slugify(title);
      counter++;
    } catch (error) {
      Logger.error('Error checking for duplicate slug:', error);
      break;
    }
  }
  
  Logger.log(`Creating resume with title: ${title}`);

    const data: ResumeData = {
      ...defaultResumeData,
      basics: {
        ...defaultResumeData.basics,
        headline: summary,
      },
    };

    const resume = await this.prisma.resume.create({
      data: {
        userId,
        visibility: "private",
        data,
        title,
        slug,
      },
    });

    Logger.log(`Resume created successfully with ID: ${resume.id}`);
    return resume;
  }

  findAll(userId: string) {
    return this.prisma.resume.findMany({ where: { userId }, orderBy: { updatedAt: "desc" } });
  }

  private async ocrPdfBuffer(buffer: Buffer): Promise<string> {
    try {
      Logger.log("Attempting OCR for PDF using local Tesseract...");
      
      // Convert PDF to images using pdf2pic
      const pdf2pic = require("pdf2pic");
      const convert = pdf2pic.fromBuffer(buffer, {
        density: 100,
        saveFilename: "page",
        savePath: "/tmp",
        format: "png",
        width: 2000,
        height: 2000
      });

      const results = await convert.bulk(-1, true);
      
      if (!results || results.length === 0) {
        Logger.warn("No pages converted from PDF");
        return "";
      }

      let extractedText = "";
      
      // Process each page with local Tesseract
      for (const result of results) {
        if (result && result.base64) {
          const imageBuffer = Buffer.from(result.base64, 'base64');
          try {
            const pageText = await this.ocrService.recognizeImageBuffer(imageBuffer);
            if (pageText) {
              extractedText += pageText + "\n";
            }
          } catch (ocrError) {
            Logger.warn("Tesseract OCR failed for page:", ocrError);
          }
        }
      }
      
      Logger.log(`OCR completed. Extracted ${extractedText.length} characters.`);
      return extractedText.trim();
    } catch (error) {
      Logger.error("OCR processing failed:", error);
      return "";
    }
  }

  findOne(id: string, userId?: string) {
    if (userId) {
      return this.prisma.resume.findUniqueOrThrow({ where: { userId_id: { userId, id } } });
    }

    return this.prisma.resume.findUniqueOrThrow({ where: { id } });
  }

  async findOneStatistics(id: string) {
    const result = await this.prisma.statistics.findFirst({
      select: { views: true, downloads: true },
      where: { resumeId: id },
    });

    return {
      views: result?.views ?? 0,
      downloads: result?.downloads ?? 0,
    };
  }

  async findOneByUsernameSlug(username: string, slug: string, userId?: string) {
    const resume = await this.prisma.resume.findFirstOrThrow({
      where: { user: { username }, slug, visibility: "public" },
    });

    // Update statistics: increment the number of views by 1
    if (!userId) {
      await this.prisma.statistics.upsert({
        where: { resumeId: resume.id },
        create: { views: 1, downloads: 0, resumeId: resume.id },
        update: { views: { increment: 1 } },
      });
    }

    return resume;
  }

  async update(userId: string, id: string, updateResumeDto: UpdateResumeDto) {
    try {
      const { locked } = await this.prisma.resume.findUniqueOrThrow({
        where: { id },
        select: { locked: true },
      });

      if (locked) throw new BadRequestException(ErrorMessage.ResumeLocked);

      return await this.prisma.resume.update({
        data: {
          title: updateResumeDto.title,
          slug: updateResumeDto.slug,
          visibility: updateResumeDto.visibility,
          data: updateResumeDto.data as any,
        },
        where: { userId_id: { userId, id } },
      });
    } catch (error) {
      if (error.code === "P2025") {
        Logger.error(error);
        throw new InternalServerErrorException(error);
      }
    }
  }

  lock(userId: string, id: string, set: boolean) {
    return this.prisma.resume.update({
      data: { locked: set },
      where: { userId_id: { userId, id } },
    });
  }

  async remove(userId: string, id: string) {
    await Promise.all([
      // Remove files in storage, and their cached keys
      this.storageService.deleteObject(userId, "resumes", id),
      this.storageService.deleteObject(userId, "previews", id),
    ]);

    return this.prisma.resume.delete({ where: { userId_id: { userId, id } } });
  }

  async printResume(resume: ResumeDto, userId?: string) {
    const url = await this.printerService.printResume(resume);

    // Update statistics: increment the number of downloads by 1
    if (!userId) {
      await this.prisma.statistics.upsert({
        where: { resumeId: resume.id },
        create: { views: 0, downloads: 1, resumeId: resume.id },
        update: { downloads: { increment: 1 } },
      });
    }

    return url;
  }

  printPreview(resume: ResumeDto) {
    return this.printerService.printPreview(resume);
  }
}
