import { Injectable, Logger } from "@nestjs/common";

/**
 * LinkedInService (disabled stub)
 *
 * The project currently does not YET include LinkedIn integration. This stub exists so
 * the module can be built without conditional imports. Replace with a full
 * implementation when LinkedIn API support is desired. (STILL WAITING)
 */
@Injectable()
export class LinkedInService {
  private readonly logger = new Logger(LinkedInService.name);

  getAuthorizationUrl(): string {
    this.logger.warn("LinkedIn integration is disabled in this build");
    return "";
  }

  async fetchAccessToken(): Promise<{ error: string }> {
    this.logger.warn("LinkedIn integration is disabled in this build");
    return { error: "disabled" };
  }

  async fetchProfile(): Promise<null> {
    this.logger.warn("LinkedIn integration is disabled in this build");
    return null;
  }
}
