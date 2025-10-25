import { Injectable, Logger } from "@nestjs/common";
import path from "node:path";

/**
 * ExportService
 * - Renders HTML templates server-side and converts to PDF (Puppeteer) or DOCX (docx library)
 * - For Puppeteer: configure CHROME_PATH env var to a Chromium binary path (recommended in server env)
 */
@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  renderTemplateHtml(data: any, type: 'ats' | 'modern' | 'creative' = 'ats') {
    // Minimal server-side rendered HTML stub. In the client app, templates will be richer.
    const styles = `
      body{font-family: Arial, sans-serif; margin: 24px}
      .header{display:flex; justify-content:space-between}
      .section{margin-top:12px}
    `;

    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style></head><body>
      <div class="header"><div><h1>${data.basics?.name ?? 'Your Name'}</h1><div>${data.basics?.headline ?? ''}</div></div><div>${data.basics?.email ?? ''}<br/>${data.basics?.phone ?? ''}</div></div>
      <div class="section"><h2>Experience</h2>${(data.experience || []).map((e: any)=>`<div><strong>${e.title}</strong> — ${e.company || ''}<div>${e.startDate ?? ''} - ${e.endDate ?? ''}</div><p>${e.description ?? ''}</p></div>`).join('')}</div>
      <div class="section"><h2>Education</h2>${(data.education || []).map((e: any)=>`<div><strong>${e.degree}</strong> — ${e.institution || ''}</div>`).join('')}</div>
      <div class="section"><h2>Skills</h2><div>${(data.skills || []).join(', ')}</div></div>
    </body></html>`;
  }

  async htmlToPdfBuffer(html: string): Promise<Buffer> {
    // Launch puppeteer against an installed Chrome/Chromium binary. In serverless envs use chrome-aws-lambda or similar.
    const chromePath = process.env.CHROME_PATH ?? undefined;
    this.logger.log(`Launching puppeteer (chromePath=${chromePath ? 'configured' : 'default'})`);

    // Use literal require for puppeteer so webpack can resolve it at build time.
    let puppeteer: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      puppeteer = require('puppeteer');
    } catch (e) {
      this.logger.warn('puppeteer not installed - PDF export disabled');
      throw new Error('PDF export requires puppeteer to be installed');
    }

    const browser = await puppeteer.launch({ executablePath: chromePath, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const buffer = await page.pdf({ format: 'A4', printBackground: true });
      return buffer;
    } finally {
      await browser.close();
    }
  }

  async toDocxBuffer(data: any): Promise<Buffer> {
    // Very minimal DOCX renderer using `docx` package. For production, map styles and layout properly.
    let docx: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      docx = require('docx');
    } catch (e) {
      this.logger.warn('docx package not installed - DOCX export disabled');
      throw new Error('DOCX export requires the `docx` package');
    }

    const { Document, Packer, Paragraph, TextRun } = docx;
    const doc = new Document();

    doc.addSection({ children: [new Paragraph({ children: [new TextRun({ text: data.basics?.name ?? 'Your Name', bold: true, size: 32 })] })] });

    if (Array.isArray(data.experience)) {
      for (const e of data.experience) {
        doc.addSection({ children: [new Paragraph({ children: [new TextRun({ text: `${e.title} — ${e.company ?? ''}`, bold: true })] }), new Paragraph(e.description ?? '')] });
      }
    }

    const buffer = await Packer.toBuffer(doc);
    return buffer;
  }
}
