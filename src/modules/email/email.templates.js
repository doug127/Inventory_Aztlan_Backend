// Cuerpo de cada plantilla de correo. Se arma en el momento del envío y nunca se guarda en la BD
// (db_schema.md §2): así los enlaces con token y las contraseñas temporales no quedan almacenados.
import { EMAIL_SUBJECTS, EMAIL_TEMPLATES } from '#src/shared/constants/email.js';

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

const formatDate = (date) =>
  new Intl.DateTimeFormat('es-VE', { dateStyle: 'long', timeStyle: 'short', timeZone: process.env.TZ || 'America/Caracas' })
    .format(new Date(date));

const loginUrl = () => `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login`;

/** Une párrafos en texto plano y en HTML con el mismo contenido. */
const compose = (subject, paragraphs, action) => {
  const text = [...paragraphs, action ? `${action.label}: ${action.url}` : null, '', 'Inventario Aztlan — Agrícola Aztlan, C.A.']
    .filter((line) => line !== null)
    .join('\n\n');
  const html = [
    `<div style="font-family:Arial,sans-serif;max-width:560px;line-height:1.5;color:#222">`,
    `<h2 style="color:#2e5d34">${escapeHtml(subject)}</h2>`,
    ...paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`),
    action
      ? `<p><a href="${escapeHtml(action.url)}" style="background:#2e5d34;color:#fff;padding:10px 18px;border-radius:4px;text-decoration:none">${escapeHtml(action.label)}</a></p>` +
        `<p style="font-size:12px;color:#666">Si el botón no funciona, copie este enlace: ${escapeHtml(action.url)}</p>`
      : '',
    `<p style="font-size:12px;color:#666">Inventario Aztlan — Agrícola Aztlan, C.A.</p>`,
    `</div>`,
  ].join('');
  return { subject, text, html };
};

const RENDERERS = {
  [EMAIL_TEMPLATES.WELCOME]: ({ user, temporaryPassword }) =>
    compose(
      EMAIL_SUBJECTS.WELCOME,
      [
        `Hola ${user.fullName}, se creó su cuenta en Inventario Aztlan.`,
        `Usuario: ${user.username}`,
        temporaryPassword
          ? `Contraseña temporal: ${temporaryPassword}. Deberá cambiarla en su primer ingreso.`
          : 'Su administrador le entregará la contraseña temporal. Deberá cambiarla en su primer ingreso.',
      ],
      { label: 'Ingresar', url: loginUrl() }
    ),

  [EMAIL_TEMPLATES.PASSWORD_RESET]: ({ user, resetLink, expiresAt }) =>
    compose(
      EMAIL_SUBJECTS.PASSWORD_RESET,
      [
        `Hola ${user.fullName}, recibimos una solicitud para restablecer la contraseña de ${user.username}.`,
        `El enlace es de un solo uso y vence el ${formatDate(expiresAt)}.`,
        'Si usted no lo solicitó, ignore este correo: su contraseña actual sigue funcionando.',
      ],
      { label: 'Restablecer contraseña', url: resetLink }
    ),

  [EMAIL_TEMPLATES.PASSWORD_CHANGED]: ({ user, occurredAt }) =>
    compose(EMAIL_SUBJECTS.PASSWORD_CHANGED, [
      `Hola ${user.fullName}, la contraseña de ${user.username} se cambió el ${formatDate(occurredAt)}.`,
      'Por seguridad se cerraron todas sus sesiones abiertas.',
      'Si usted no hizo este cambio, comuníquese de inmediato con el administrador del sistema.',
    ]),

  [EMAIL_TEMPLATES.ACCOUNT_LOCKED]: ({ user, occurredAt }) =>
    compose(EMAIL_SUBJECTS.ACCOUNT_LOCKED, [
      `Hola ${user.fullName}, la cuenta ${user.username} se bloqueó el ${formatDate(occurredAt)} por varios intentos fallidos de inicio de sesión.`,
      'Podrá volver a intentarlo en 15 minutos o restablecer su contraseña.',
      'Si no fue usted, avise al administrador del sistema.',
    ]),
};

/** Devuelve { subject, text, html } para una plantilla del catálogo. */
export const renderEmail = (template, context) => {
  const render = RENDERERS[template];
  if (!render) throw new Error(`Plantilla de correo sin cuerpo definido: ${template}`);
  return render(context);
};
