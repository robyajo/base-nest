import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private transporter: Transporter;
  private readonly fromAddress: string;
  private readonly appUrl: string;

  constructor(configService: ConfigService) {
    this.fromAddress =
      configService.get<string>('MAIL_FROM') ?? 'noreply@vynix.com';
    this.appUrl =
      configService.get<string>('APP_URL') ?? 'http://localhost:8000';

    const host = configService.get<string>('MAIL_HOST');
    const port = configService.get<number>('MAIL_PORT');
    const user = configService.get<string>('MAIL_USER');
    const pass = configService.get<string>('MAIL_PASS');

    if (host && port && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
    } else {
      this.transporter = nodemailer.createTransport({
        host: 'localhost',
        port: 1025,
        secure: false,
        ignoreTLS: true,
      });
    }
  }

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const verificationUrl = `${this.appUrl}/api/v1/auth/verify-email?token=${token}`;

    await this.transporter.sendMail({
      from: this.fromAddress,
      to,
      subject: 'Verify your email address',
      html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email Verification</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:40px 16px">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06)">
          <tr>
            <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px 40px;text-align:center">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px">VYNIX</h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:14px">Email Verification</p>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 40px 28px">
              <h2 style="margin:0 0 8px;color:#1a1a2e;font-size:18px;font-weight:600">Hi there,</h2>
              <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6">Thanks for signing up! Please verify your email address to activate your account and get started.</p>
              <table cellpadding="0" cellspacing="0" style="margin:0 0 24px">
                <tr>
                  <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:8px;box-shadow:0 4px 12px rgba(99,102,241,0.3)">
                    <a href="${verificationUrl}" target="_blank" style="display:inline-block;padding:14px 36px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:0.3px">Verify Email Address</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 6px;color:#64748b;font-size:13px;line-height:1.5">Or copy and paste this link into your browser:</p>
              <p style="margin:0 0 28px;color:#6366f1;font-size:13px;word-break:break-all;line-height:1.5">${verificationUrl}</p>
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 20px">
              <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.5">This link expires in <strong style="color:#64748b">24 hours</strong>. If you did not create an account, you can safely ignore this email.</p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8fafc;padding:20px 40px;text-align:center;border-top:1px solid #e2e8f0">
              <p style="margin:0;color:#94a3b8;font-size:12px">&copy; 2026 VYNIX. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    });
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const resetUrl = `${this.appUrl}/reset-password?token=${token}`;

    await this.transporter.sendMail({
      from: this.fromAddress,
      to,
      subject: 'Reset your password',
      html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Reset</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:40px 16px">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06)">
          <tr>
            <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px 40px;text-align:center">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px">VYNIX</h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:14px">Password Reset</p>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 40px 28px">
              <h2 style="margin:0 0 8px;color:#1a1a2e;font-size:18px;font-weight:600">Forgot your password?</h2>
              <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6">No worries! Click the button below to reset your password and get back to streaming.</p>
              <table cellpadding="0" cellspacing="0" style="margin:0 0 24px">
                <tr>
                  <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:8px;box-shadow:0 4px 12px rgba(99,102,241,0.3)">
                    <a href="${resetUrl}" target="_blank" style="display:inline-block;padding:14px 36px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:0.3px">Reset Password</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 6px;color:#64748b;font-size:13px;line-height:1.5">Or copy and paste this link into your browser:</p>
              <p style="margin:0 0 28px;color:#6366f1;font-size:13px;word-break:break-all;line-height:1.5">${resetUrl}</p>
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 20px">
              <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.5">This link expires in <strong style="color:#64748b">24 hours</strong>. If you did not request a password reset, you can safely ignore this email.</p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8fafc;padding:20px 40px;text-align:center;border-top:1px solid #e2e8f0">
              <p style="margin:0;color:#94a3b8;font-size:12px">&copy; 2026 VYNIX. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    });
  }
}
