// Usuarios de prueba, uno o más por rol, todos con la MISMA contraseña configurable en .env:
//   SEED_USERS_PASSWORD   (si no se define, se usa SEED_SUPERADMIN_PASSWORD)
//   SEED_USERS_EMAIL_DOMAIN (por defecto aztlan.local)
//
// Quedan con must_change_password = true para probar el flujo de cambio de contraseña. Es
// idempotente: volver a ejecutarlo restablece la contraseña común, vuelve a exigir el cambio,
// los desbloquea, los reactiva y revoca sus sesiones. Para eso:
//   pnpm db:seed:demo-users
// No se ejecuta en producción.
import bcrypt from 'bcrypt';
import { passwordPolicyIssues } from '../../shared/schemas/password.js';
import { BCRYPT_COST } from '../../shared/constants/auth.js';

export const DEMO_USERS = [
  { username: 'maria.pena', fullName: 'María Peña', roleCode: 'ADMIN' },
  { username: 'pedro.gomez', fullName: 'Pedro Gómez', roleCode: 'ALMACENISTA' },
  { username: 'luis.rojas', fullName: 'Luis Rojas', roleCode: 'ALMACENISTA' },
  { username: 'ana.torres', fullName: 'Ana Torres', roleCode: 'USUARIO' },
];

export const up = async (queryInterface) => {
  if (process.env.NODE_ENV === 'production') return;

  const password = process.env.SEED_USERS_PASSWORD || process.env.SEED_SUPERADMIN_PASSWORD;
  if (!password) {
    throw new Error('Defina SEED_USERS_PASSWORD (o SEED_SUPERADMIN_PASSWORD) en .env para crear los usuarios de prueba.');
  }
  const issues = passwordPolicyIssues(password);
  if (issues.length) throw new Error(`SEED_USERS_PASSWORD no cumple la política: ${issues.join('; ')}.`);

  const domain = (process.env.SEED_USERS_EMAIL_DOMAIN || 'aztlan.local').toLowerCase();
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  for (const user of DEMO_USERS) {
    await queryInterface.sequelize.query(
      `INSERT INTO users (username, email, password_hash, full_name, role_id, must_change_password)
       SELECT :username, :email, :passwordHash, :fullName, r.id, true FROM roles r WHERE r.code = :roleCode
       ON CONFLICT (username) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             must_change_password = true,
             password_changed_at = now(),
             failed_login_attempts = 0,
             locked_until = NULL,
             is_active = true`,
      { replacements: { ...user, email: `${user.username}@${domain}`, passwordHash } }
    );
  }

  // Al restablecerlos, sus sesiones anteriores dejan de servir.
  await queryInterface.sequelize.query(
    `UPDATE refresh_tokens SET revoked_at = now()
     WHERE revoked_at IS NULL AND user_id IN (SELECT id FROM users WHERE username IN (:usernames))`,
    { replacements: { usernames: DEMO_USERS.map((u) => u.username) } }
  );
};

export const down = async (queryInterface) => {
  await queryInterface.sequelize.query('DELETE FROM users WHERE username IN (:usernames)', {
    replacements: { usernames: DEMO_USERS.map((u) => u.username) },
  });
};
