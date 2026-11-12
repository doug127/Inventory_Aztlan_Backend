// SUPERADMIN inicial. La contraseña sale de SEED_SUPERADMIN_PASSWORD; si no existe se genera una
// temporal aleatoria y se muestra una sola vez. Siempre queda con must_change_password = true.
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';

const USERNAME = 'superadmin';

export const up = async (queryInterface) => {
  const email = (process.env.SEED_SUPERADMIN_EMAIL || 'superadmin@aztlan.local').toLowerCase();
  let password = process.env.SEED_SUPERADMIN_PASSWORD;

  if (!password) {
    password = `Az${crypto.randomBytes(9).toString('base64url')}9`;
    process.stdout.write(`\n[seed] SUPERADMIN '${USERNAME}' creado con contraseña temporal: ${password}\n`);
    process.stdout.write('[seed] Se pedirá cambiarla en el primer inicio de sesión.\n\n');
  }

  const passwordHash = await bcrypt.hash(password, 12);

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
