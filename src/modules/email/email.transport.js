import nodemailer from 'nodemailer';

/**
 * Transporte SMTP configurado por .env. En desarrollo, por defecto apunta a Mailpit
 * (localhost:1025), un servidor de correo de pruebas con bandeja web en http://localhost:8025.
 *
 *   SMTP_HOST, SMTP_PORT, SMTP_SECURE (true = TLS directo, puerto 465), SMTP_USER, SMTP_PASSWORD
 */
export const createMailTransport = (env = process.env) =>
  nodemailer.createTransport({
    host: env.SMTP_HOST || 'localhost',
    port: Number(env.SMTP_PORT) || 1025,
    secure: env.SMTP_SECURE === 'true',
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    // Mailpit y los servidores internos suelen no tener TLS; con credenciales se exige.
    ignoreTLS: !env.SMTP_USER && env.SMTP_SECURE !== 'true',
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

export const mailFrom = (env = process.env) => env.MAIL_FROM || 'Inventario Aztlan <no-reply@aztlan.local>';
