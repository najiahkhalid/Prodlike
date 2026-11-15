import { Injectable, Logger } from '@nestjs/common';

export interface SentMail {
  to: string;
  subject: string;
  text: string;
}

/**
 * Development mailer: prints emails to the API log instead of sending them.
 * A real SMTP transport can replace this later without touching callers.
 * `outbox` keeps the last messages so tests can read reset links.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');
  readonly outbox: SentMail[] = [];

  async send(mail: SentMail): Promise<void> {
    this.outbox.push(mail);
    if (this.outbox.length > 50) this.outbox.shift();
    this.logger.log(`\n  To: ${mail.to}\n  Subject: ${mail.subject}\n\n${mail.text}\n`);
  }
}
