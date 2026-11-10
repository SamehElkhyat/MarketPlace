import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailTransport {
  send(email: OutgoingEmail): Promise<void>;
}

class ResendTransport implements EmailTransport {
  private readonly client = new Resend(env.RESEND_API_KEY);

  async send(email: OutgoingEmail): Promise<void> {
    const { error } = await this.client.emails.send({ from: env.EMAIL_FROM, ...email });
    if (error) throw new Error(`Resend error: ${error.message}`);
  }
}

/** SMTP transport — used locally with Mailpit (see docker-compose.yml). */
class SmtpTransport implements EmailTransport {
  private readonly transporter = nodemailer.createTransport(env.SMTP_URL!);

  async send(email: OutgoingEmail): Promise<void> {
    await this.transporter.sendMail({ from: env.EMAIL_FROM, ...email });
  }
}

/** Keeps messages in memory — tests assert on `outbox`. */
export class MemoryTransport implements EmailTransport {
  readonly outbox: OutgoingEmail[] = [];

  async send(email: OutgoingEmail): Promise<void> {
    this.outbox.push(email);
    logger.debug({ to: email.to, subject: email.subject }, 'email captured (memory transport)');
  }
}

function createTransport(): EmailTransport {
  if (env.NODE_ENV === 'test') return new MemoryTransport();
  if (env.RESEND_API_KEY) return new ResendTransport();
  if (env.SMTP_URL) return new SmtpTransport();
  logger.warn('No RESEND_API_KEY or SMTP_URL configured — e-mails are only logged');
  return {
    async send(email) {
      logger.info({ to: email.to, subject: email.subject, text: email.text }, 'email (not sent: no transport)');
    },
  };
}

export const emailTransport: EmailTransport = createTransport();
