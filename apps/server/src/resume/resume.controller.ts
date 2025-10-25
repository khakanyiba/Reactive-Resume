import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  InternalServerErrorException,
  Logger,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiTags } from "@nestjs/swagger";
import type { User as UserEntity } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import {
  CreateResumeDto,
  importResumeSchema,
  ResumeDto,
  UpdateResumeDto,
} from "@reactive-resume/dto";
import { ResumeData, resumeDataSchema } from "@reactive-resume/schema";
import { ErrorMessage } from "@reactive-resume/utils";
import set from "lodash.set";
import { zodToJsonSchema } from "zod-to-json-schema";

import { User } from "@/server/user/decorators/user.decorator";

import { OptionalGuard } from "../auth/guards/optional.guard";
import { TwoFactorGuard } from "../auth/guards/two-factor.guard";
import { Resume } from "./decorators/resume.decorator";
import { ResumeGuard } from "./guards/resume.guard";
import { ResumeService } from "./resume.service";
import { OcrService } from "./ocr.service";
import { ParserService } from "./parser.service";
import { ExportService } from "./export.service";

@ApiTags("Resume")
@Controller("resume")
export class ResumeController {
  constructor(
    private readonly resumeService: ResumeService,
    private readonly ocrService: OcrService,
    private readonly parserService: ParserService,
    private readonly exportService: ExportService,
  ) {}

  @Get("schema")
  getSchema() {
    return zodToJsonSchema(resumeDataSchema);
  }

  @Post()
  @UseGuards(TwoFactorGuard)
  async create(@User() user: UserEntity, @Body() createResumeDto: CreateResumeDto) {
    try {
      return await this.resumeService.create(user.id, createResumeDto);
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError && error.code === "P2002") {
        throw new BadRequestException(ErrorMessage.ResumeSlugAlreadyExists);
      }

      Logger.error(error);
      throw new InternalServerErrorException(error);
    }
  }

  @Post("import")
  @UseGuards(TwoFactorGuard)
  async import(@User() user: UserEntity, @Body() importResumeDto: unknown) {
    try {
      const result = importResumeSchema.parse(importResumeDto);
      return await this.resumeService.import(user.id, result);
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError && error.code === "P2002") {
        throw new BadRequestException(ErrorMessage.ResumeSlugAlreadyExists);
      }

      Logger.error(error);
      throw new InternalServerErrorException(error);
    }
  }

  @Post("import-file")
  @UseGuards(TwoFactorGuard)
  @UseInterceptors(FileInterceptor("file"))
  async importFile(@User() user: UserEntity, @UploadedFile("file") file: Express.Multer.File) {
    try {
      if (!file) throw new BadRequestException("No file provided");

      // Allow images to be OCR'd directly
      const mime = file.mimetype.toLowerCase();
      if (mime.startsWith("image/")) {
        const text = await this.ocrService.recognizeImageBuffer(file.buffer);
        const parsed = this.parserService.parse(text);
        return { text, parsed };
      }

      return await this.resumeService.importFromFile(user.id, file);
    } catch (error) {
      Logger.error(error);
      throw new InternalServerErrorException(error);
    }
  }

  @Post("ocr")
  @UseGuards(TwoFactorGuard)
  @UseInterceptors(FileInterceptor("file"))
  async ocr(@UploadedFile("file") file: Express.Multer.File) {
    if (!file) throw new BadRequestException("No file provided");

    const text = await this.ocrService.recognizeImageBuffer(file.buffer);
    return { text };
  }

  @Post("parse")
  @UseGuards(TwoFactorGuard)
  async parse(@Body() body: { text: string }) {
    if (!body || !body.text) throw new BadRequestException("No text provided");

    const parsed = this.parserService.parse(body.text);
    return parsed;
  }

  

  @Post('preview/template')
  @UseGuards(TwoFactorGuard)
  async previewTemplate(@Body() body: { data: any; template?: 'ats'|'modern'|'creative' }) {
    const html = this.exportService.renderTemplateHtml(body.data, body.template ?? 'ats');
    return { html };
  }

  @Post('export/pdf')
  @UseGuards(TwoFactorGuard)
  async exportPdf(@Body() body: { data: any }) {
    const html = this.exportService.renderTemplateHtml(body.data, 'ats');
    const buffer = await this.exportService.htmlToPdfBuffer(html);
    return { buffer: buffer.toString('base64') };
  }

  @Post('export/docx')
  @UseGuards(TwoFactorGuard)
  async exportDocx(@Body() body: { data: any }) {
    const buffer = await this.exportService.toDocxBuffer(body.data);
    return { buffer: buffer.toString('base64') };
  }

  @Get()
  @UseGuards(TwoFactorGuard)
  findAll(@User() user: UserEntity) {
    return this.resumeService.findAll(user.id);
  }

  @Get(":id")
  @UseGuards(TwoFactorGuard, ResumeGuard)
  findOne(@Resume() resume: ResumeDto) {
    return resume;
  }

  @Get(":id/statistics")
  @UseGuards(TwoFactorGuard)
  findOneStatistics(@Param("id") id: string) {
    return this.resumeService.findOneStatistics(id);
  }

  @Get("/public/:username/:slug")
  @UseGuards(OptionalGuard)
  async findOneByUsernameSlug(
    @Param("username") username: string,
    @Param("slug") slug: string,
    @User("id") userId: string,
  ) {
    const resume = await this.resumeService.findOneByUsernameSlug(username, slug, userId);

    // Hide private notes from public resume API responses
    set(resume.data as ResumeData, "metadata.notes", undefined);

    return resume;
  }

  @Patch(":id")
  @UseGuards(TwoFactorGuard)
  update(
    @User() user: UserEntity,
    @Param("id") id: string,
    @Body() updateResumeDto: UpdateResumeDto,
  ) {
    return this.resumeService.update(user.id, id, updateResumeDto);
  }

  @Patch(":id/lock")
  @UseGuards(TwoFactorGuard)
  lock(@User() user: UserEntity, @Param("id") id: string, @Body("set") set = true) {
    return this.resumeService.lock(user.id, id, set);
  }

  @Delete(":id")
  @UseGuards(TwoFactorGuard)
  remove(@User() user: UserEntity, @Param("id") id: string) {
    return this.resumeService.remove(user.id, id);
  }

  @Get("/print/:id")
  @UseGuards(OptionalGuard, ResumeGuard)
  async printResume(@User("id") userId: string | undefined, @Resume() resume: ResumeDto) {
    try {
      const url = await this.resumeService.printResume(resume, userId);

      return { url };
    } catch (error) {
      Logger.error(error);
      throw new InternalServerErrorException(error);
    }
  }

  @Get("/print/:id/preview")
  @UseGuards(TwoFactorGuard, ResumeGuard)
  async printPreview(@Resume() resume: ResumeDto) {
    try {
      const url = await this.resumeService.printPreview(resume);

      return { url };
    } catch (error) {
      Logger.error(error);
      throw new InternalServerErrorException(error);
    }
  }
}
