import { describe, it, expect } from 'vitest';
import { renderEmail } from '#src/modules/email/email.templates.js';
import { EMAIL_SUBJECTS } from '#src/shared/constants/email.js';

const user = { username: 'pedro.gomez', fullName: 'Pedro Gómez', email: 'pedro@aztlan.test' };
const occurredAt = new Date('2026-11-12T15:30:00Z');

describe('renderEmail', () => {
  it('PASSWORD_RESET incluye el enlace en texto y en HTML, y la vigencia', () => {
    const link = 'http://localhost:5173/reset-password?token=abc_DEF-123';
    const { subject, text, html } = renderEmail('PASSWORD_RESET', { user, resetLink: link, expiresAt: occurredAt });
    expect(subject).toBe(EMAIL_SUBJECTS.PASSWORD_RESET);
    expect(text).toContain(link);
    expect(text).toContain('pedro.gomez');
    expect(text).toMatch(/un solo uso/);
    expect(html).toContain(`href="${link}"`);
  });

  it.each(['PASSWORD_CHANGED', 'ACCOUNT_LOCKED'])('%s menciona al usuario y la fecha', (template) => {
    const { subject, text } = renderEmail(template, { user, occurredAt });
    expect(subject).toBe(EMAIL_SUBJECTS[template]);
    expect(text).toContain('Pedro Gómez');
    expect(text).toContain('2026');
  });

  it('WELCOME incluye la contraseña temporal solo si se entrega en el contexto', () => {
    expect(renderEmail('WELCOME', { user, temporaryPassword: 'Temp-Clave-1' }).text).toContain('Temp-Clave-1');
    expect(renderEmail('WELCOME', { user }).text).toMatch(/administrador le entregará/);
  });

  it('escapa el HTML de los datos del usuario', () => {
    const { html } = renderEmail('PASSWORD_CHANGED', { user: { ...user, fullName: '<script>x</script>' }, occurredAt });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('una plantilla desconocida lanza un error', () => {
    expect(() => renderEmail('OTRA', { user })).toThrow(/sin cuerpo/);
  });
});
