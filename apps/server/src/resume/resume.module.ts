import { Module } from "@nestjs/common";

import { AuthModule } from "@/server/auth/auth.module";
import { PrinterModule } from "@/server/printer/printer.module";

import { StorageModule } from "../storage/storage.module";
import { ResumeController } from "./resume.controller";
import { ResumeService } from "./resume.service";
import { OcrService } from "./ocr.service";
import { ParserService } from "./parser.service";
import { ExportService } from "./export.service";

@Module({
  imports: [AuthModule, PrinterModule, StorageModule],
  controllers: [ResumeController],
  providers: [ResumeService, OcrService, ParserService, ExportService],
  exports: [ResumeService, ParserService, ExportService],
})
export class ResumeModule {}
