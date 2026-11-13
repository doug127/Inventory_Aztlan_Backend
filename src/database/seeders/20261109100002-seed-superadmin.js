// SUPERADMIN inicial. La contraseña la define quien instala, en SEED_SUPERADMIN_PASSWORD (.env), y
// debe cumplir la política de contraseñas. No se genera una aleatoria: una contraseña que solo se
// muestra una vez en consola se pierde con facilidad y deja el sistema sin acceso.
// El usuario queda con must_change_password = true.
// Para restablecerla después: pnpm db:reset-superadmin
import bcrypt from 'bcrypt';
import { passwordPolicyIssues } from '../../shared/schemas/password.js';
import { BCRYPT_COST } from '../../shared/constants/auth.js';

const USERNAME = 'superadmin';

export const up = async (queryInterface) => {
  const email = (process.env.SEED_SUPERADMIN_EMAIL || 'superadmin@aztlan.local').toLowerCase();
  const password = process.env.SEED_SUPERADMIN_PASSWORD;

  if (!password) {
    throw new Error('Defina SEED_SUPERADMIN_PASSWORD en .env antes de ejecutar las semillas.');
  }
  const issues = passwordPolicyIssues(password);
  if (issues.length) {
    throw new Error(`SEED_SUPERADMIN_PASSWORD no cumple la política: ${issues.join('; ')}.`);
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  await queryInterface.sequelize.query(
    `INSERT INTO users (username, email, password_hash, full_name, role_id, must_change_password)
     SELECT :username, :email, :passwordHash, 'Superadministrador del Sistema', r.id, true
     FROM roles r WHERE r.code = 'SUPERADMIN';`,
    { replacements: { username: USERNAME, email, passwordHash } }
  );
};

export const down = async (queryInterface) => {
  await queryInterface.sequelize.query('DELETE FROM users WHERE username = :username;', {
    replacements: { username: USERNAME },
  });
};
