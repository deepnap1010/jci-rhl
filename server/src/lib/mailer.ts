// ============================================================
//  MAILER  —  Nodemailer over SMTP
//
//  Sends the welcome email containing a new user's login
//  credentials (email + temporary password + role).
//
//  ── WHAT YOU NEED TO SEND EMAIL (set these in server/.env) ──
//    SMTP_HOST   e.g. smtp.gmail.com  /  smtp.sendgrid.net
//    SMTP_PORT   587 (STARTTLS) or 465 (SSL)
//    SMTP_SECURE "true" for port 465, otherwise "false"
//    SMTP_USER   the SMTP account / username
//    SMTP_PASS   the SMTP password  (for Gmail: an App Password,
//                NOT your normal password — 2FA must be on)
//    SMTP_FROM   the "From" address, e.g. "SmartFactory <no-reply@yourco.com>"
//
//  If SMTP is NOT configured, we DON'T crash — we log the email
//  to the server console instead, so the flow still works in dev.
// ============================================================
import nodemailer, { Transporter } from 'nodemailer';
import type { Role } from '@shared/types';

let transporter: Transporter | null = null;
let warnedNoSmtp = false;

function getTransporter(): Transporter | null {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null; // not configured

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: String(SMTP_SECURE) === 'true', // true → 465, false → 587/STARTTLS
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

export interface CredentialsEmail {
  to: string;
  name: string;
  role: Role;
  tempPassword: string;
  loginUrl?: string;
}

export async function sendCredentialsEmail(opts: CredentialsEmail): Promise<{ sent: boolean }> {
  const loginUrl = opts.loginUrl || process.env.APP_URL || 'http://localhost:5173';
  const from = process.env.SMTP_FROM || 'SmartFactory <no-reply@smartfactory.local>';

  const subject = 'Your SmartFactory account is ready';
  const text =
    `Hi ${opts.name},\n\n` +
    `A SmartFactory account has been created for you.\n\n` +
    `  Login URL : ${loginUrl}\n` +
    `  Email     : ${opts.to}\n` +
    `  Password  : ${opts.tempPassword}  (temporary)\n` +
    `  Role      : ${opts.role}\n\n` +
    `For your security you will be asked to set a new password the first time you log in.\n\n` +
    `— SmartFactory`;

  const html = `
  <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:520px;margin:auto;color:#1f2937">
    <h2 style="color:#3b5bfd;margin-bottom:4px">Welcome to SmartFactory</h2>
    <p>Hi ${escapeHtml(opts.name)}, an account has been created for you.</p>
    <table style="border-collapse:collapse;margin:16px 0;font-size:14px">
      <tr><td style="padding:6px 12px;color:#6b7280">Login URL</td>
          <td style="padding:6px 12px"><a href="${loginUrl}">${loginUrl}</a></td></tr>
      <tr><td style="padding:6px 12px;color:#6b7280">Email</td>
          <td style="padding:6px 12px"><b>${escapeHtml(opts.to)}</b></td></tr>
      <tr><td style="padding:6px 12px;color:#6b7280">Temporary password</td>
          <td style="padding:6px 12px"><b>${escapeHtml(opts.tempPassword)}</b></td></tr>
      <tr><td style="padding:6px 12px;color:#6b7280">Role</td>
          <td style="padding:6px 12px">${escapeHtml(opts.role)}</td></tr>
    </table>
    <p style="font-size:13px;color:#6b7280">
      You'll be asked to set a new password the first time you sign in.
    </p>
  </div>`;

  const tx = getTransporter();
  if (!tx) {
    if (!warnedNoSmtp) {
      console.warn('⚠️  SMTP not configured — printing credentials to console instead of emailing.');
      console.warn('    Set SMTP_HOST / SMTP_USER / SMTP_PASS in server/.env to send real email.');
      warnedNoSmtp = true;
    }
    console.log('\n📧 [DEV] Credentials email (not sent — SMTP off):\n' + text + '\n');
    return { sent: false };
  }

  await tx.sendMail({ from, to: opts.to, subject, text, html });
  console.log(`📧 Credentials email sent to ${opts.to}`);
  return { sent: true };
}

// ── Job-assignment notification email ──────────────────────
export interface JobAssignmentEmail {
  to: string;
  name: string;
  audience: 'operator' | 'supervisor';
  jobNumber: string;
  orderNumber: string;
  fabricName: string;
  stage: string;
  machineId: string | null;
  targetProduction: number;
  shift: string;
}

export async function sendJobAssignmentEmail(opts: JobAssignmentEmail): Promise<{ sent: boolean }> {
  const from = process.env.SMTP_FROM || 'SmartFactory <no-reply@smartfactory.local>';
  const loginUrl = process.env.APP_URL || 'http://localhost:5173';
  const roleWord = opts.audience === 'operator' ? 'operate' : 'supervise';
  const target = opts.targetProduction ? `${opts.targetProduction.toLocaleString()} mtr` : '—';
  const machine = opts.machineId || '— (unassigned)';
  const subject = `New job assigned: ${opts.jobNumber || 'Job'}`;

  const text =
    `Hi ${opts.name},\n\n` +
    `You have been assigned to ${roleWord} a job.\n\n` +
    `  Job      : ${opts.jobNumber || '—'}\n` +
    `  Order    : ${opts.orderNumber || '—'}\n` +
    `  Fabric   : ${opts.fabricName || '—'}\n` +
    `  Stage    : ${opts.stage || '—'}\n` +
    `  Machine  : ${machine}\n` +
    `  Target   : ${target}\n` +
    `  Shift    : ${opts.shift || 'A'}\n\n` +
    `Open SmartFactory: ${loginUrl}\n\n` +
    `— SmartFactory`;

  const html = `
  <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:520px;margin:auto;color:#1f2937">
    <h2 style="color:#3b5bfd;margin-bottom:4px">New job assigned</h2>
    <p>Hi ${escapeHtml(opts.name)}, you have been assigned to ${roleWord} the job below.</p>
    <table style="border-collapse:collapse;margin:16px 0;font-size:14px">
      <tr><td style="padding:6px 12px;color:#6b7280">Job</td><td style="padding:6px 12px"><b>${escapeHtml(opts.jobNumber || '—')}</b></td></tr>
      <tr><td style="padding:6px 12px;color:#6b7280">Order</td><td style="padding:6px 12px">${escapeHtml(opts.orderNumber || '—')}</td></tr>
      <tr><td style="padding:6px 12px;color:#6b7280">Fabric</td><td style="padding:6px 12px">${escapeHtml(opts.fabricName || '—')}</td></tr>
      <tr><td style="padding:6px 12px;color:#6b7280">Stage</td><td style="padding:6px 12px">${escapeHtml(opts.stage || '—')}</td></tr>
      <tr><td style="padding:6px 12px;color:#6b7280">Machine</td><td style="padding:6px 12px">${escapeHtml(machine)}</td></tr>
      <tr><td style="padding:6px 12px;color:#6b7280">Target</td><td style="padding:6px 12px"><b>${escapeHtml(target)}</b></td></tr>
      <tr><td style="padding:6px 12px;color:#6b7280">Shift</td><td style="padding:6px 12px">${escapeHtml(opts.shift || 'A')}</td></tr>
    </table>
    <p style="font-size:13px;color:#6b7280"><a href="${loginUrl}">Open SmartFactory →</a></p>
  </div>`;

  const tx = getTransporter();
  if (!tx) {
    console.log('\n📧 [DEV] Job-assignment email (not sent — SMTP off):\n' + text + '\n');
    return { sent: false };
  }
  await tx.sendMail({ from, to: opts.to, subject, text, html });
  console.log(`📧 Job-assignment email sent to ${opts.to}`);
  return { sent: true };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
  );
}
