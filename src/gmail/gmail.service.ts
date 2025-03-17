import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class GmailService {
  private readonly logger = new Logger(GmailService.name);
  private transporter: nodemailer.Transporter;

  constructor() {
    // Create a transporter using Gmail SMTP settings
    this.transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true, // true for 465, false for other ports
      auth: {
        user: process.env.SENDER_EMAIL, // Your Gmail address
        pass: process.env.APP_PASSWORD,   // Your Gmail app password
      },
    });
  }

  async sendEmail(to: string, subject: string, htmlBody: string): Promise<any> {
    try {
      const info = await this.transporter.sendMail({
        from: `"CommitScope - The Code Review Assistant" <${process.env.SENDER_EMAIL}>`,
        to,
        subject,
        html: htmlBody,
      });
      this.logger.log(`Email sent: ${info.messageId}`);
      return info;
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}: ${error.message}`);
      throw error;
    }
  }
}
