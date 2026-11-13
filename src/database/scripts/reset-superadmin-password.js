// Restablece la contraseña del SUPERADMIN con el valor de SEED_SUPERADMIN_PASSWORD (.env).
//
//   pnpm db:reset-superadmin
//
// Sirve cuando se pierde la contraseña del único superadministrador. Además de cambiar el hash:
//   - marca must_change_password = true, para que la cambie en el siguiente ingreso;
//   - actualiza password_changed_at, lo que invalida los access tokens emitidos antes;
//   - revoca sus refresh tokens y reinicia el contador de intentos fallidos;
//   - registra PASSWORD_CHANGED en auth_events;
//   - verifica que el hash guardado corresponda a la contraseña antes de confirmar.
import { pathToFileURL } from 'node:url';
import bcrypt from 'bcrypt';
import { sequelize } from '../../config/database.js';
import { passwordPolicyIssues } from '../../shared/schemas/password.js';
import { BCRYPT_COST } from '../../shared/constants/auth.js';

export const resetSuperadminPassword = async (password, { username = 'superadmin' } = {}) => {
  if (!password) throw new Error('Defina SEED_SUPERADMIN_PASSWORD en .env con la contraseña nueva.');
  const issues = passwordPolicyIssues(password);
  if (issues.length) throw new Error(`La contraseña no cumple la política: ${issues.join('; ')}.`);

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  return sequelize.transaction(async (transaction) => {
    const [rows] = await sequelize.query(
      `UPDATE users
          SET password_hash = :passwordHash, password_changed_at = now(), must_change_password = true,
              failed_login_attempts = 0, locked_until = NULL
        WHERE username = :username
        RETURNING id, password_hash`,
      { replacements: { passwordHash, username }, transaction }
    );
    if (!rows.length) throw new Error(`No existe el usuario "${username}".`);
    const { id, password_hash: stored } = rows[0];

    // Si por cualquier motivo lo guardado no corresponde a la contraseña, se revierte todo.
    if (!(await bcrypt.compare(password, stored))) {
      throw new Error('El hash guardado no corresponde a la contraseña; no se aplicó ningún cambio.');
    }

    const [, revoked] = await sequelize.query(
      'UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = :id AND revoked_at IS NULL',
      { replacements: { id }, transaction }
    );
    await sequelize.query(
      `INSERT INTO auth_events (user_id, username_attempted, event_type, user_agent)
       VALUES (:id, :username, 'PASSWORD_CHANGED', 'cli:db:reset-superadmin')`,
      { replacements: { id, username }, transaction }
    );

    return { userId: id, username, revokedSessions: revoked?.rowCount ?? 0 };
  });
};

// Ejecución desde la línea de comandos.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { username, revokedSessions } = await resetSuperadminPassword(process.env.SEED_SUPERADMIN_PASSWORD);
    process.stdout.write(
      `Contraseña de "${username}" restablecida en la base "${sequelize.getDatabaseName()}". ` +
        `Sesiones revocadas: ${revokedSessions}. Deberá cambiarla en el próximo ingreso.\n`
    );
    process.exitCode = 0;
  } catch (error) {
    process.stderr.write(`No se pudo restablecer la contraseña: ${error.message}\n`);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}
