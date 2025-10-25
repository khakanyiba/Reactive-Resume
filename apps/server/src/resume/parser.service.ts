import { Injectable } from "@nestjs/common";

export interface ParsedResume {
  name?: string;
  email?: string;
  phone?: string;
  skills?: string[];
  experience?: Array<{ title?: string; company?: string; dateRange?: string; description?: string }>;
  education?: Array<{ degree?: string; institution?: string; dateRange?: string }>;
  raw?: string;
}

@Injectable()
export class ParserService {
  // Very small, heuristic parser. Intended as a starting point and will need improvement
  // for production use (NLP models, entity extraction, or third-party parsers).
  parse(text: string): ParsedResume {
    const raw = text ?? "";

    const emailMatch = raw.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const phoneMatch = raw.match(/\+?[0-9]{7,15}/g);

    // Very naive name extraction: assume the first non-empty line is the name if it contains letters and spaces and less than 5 words
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let name: string | undefined;
    if (lines.length > 0) {
      const candidate = lines[0];
      if (/^[A-Za-z ,.'-]{2,80}$/.test(candidate) && candidate.split(/\s+/).length <= 5) name = candidate;
    }

    // Skills: look for a line starting with 'Skills' or common separators
    const skills: string[] = [];
    for (const line of lines.slice(0, 30)) {
      if (/^skills?/i.test(line) || line.toLowerCase().includes("skill")) {
        const parts = line.split(/[:\-–]|\n/).slice(1).join(" ").split(/[;,|•·]/).map((s) => s.trim()).filter(Boolean);
        skills.push(...parts);
        break;
      }
    }

    // Experience & education: very basic grouping by headers
    const experience: ParsedResume['experience'] = [];
    const education: ParsedResume['education'] = [];

    let currentSection: 'experience' | 'education' | null = null;
    for (const line of lines) {
      if (/^experience/i.test(line) || /^work experience/i.test(line)) {
        currentSection = 'experience';
        continue;
      }
      if (/^education/i.test(line) || /degree|university|bachelor|master/i.test(line)) {
        currentSection = 'education';
        continue;
      }

      if (currentSection === 'experience') {
        // try to parse "Title — Company (Date)"
        const m = line.match(/^(.*?)\s+[\-–—@]\s+(.*?)\s*\(?([0-9]{4}.*?)[\)]?$/);
        if (m) experience.push({ title: m[1].trim(), company: m[2].trim(), dateRange: m[3].trim() });
      }

      if (currentSection === 'education') {
        const m = line.match(/^(.*?)\s+[\-–—@]\s+(.*?)\s*\(?([0-9]{4}.*?)[\)]?$/);
        if (m) education.push({ degree: m[1].trim(), institution: m[2].trim(), dateRange: m[3].trim() });
      }
    }

    return {
      name,
      email: emailMatch?.[0],
      phone: phoneMatch?.[0],
      skills,
      experience,
      education,
      raw,
    };
  }
}
