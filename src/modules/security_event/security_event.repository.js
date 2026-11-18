// Lectura de la bitácora de seguridad (auth_events). Solo lectura: los eventos los escribe auth.
import { Op } from 'sequelize';
import { AuthEvent, Role, User } from '#src/database/models/index.model.js';

const plain = (row) => (row ? row.get({ plain: true }) : null);

const escapeLike = (value) => value.replace(/[\\%_]/g, (ch) => `\\${ch}`);

/** Lista paginada con filtros (todos combinables). */
export const listSecurityEvents = async ({ page, limit, userId, username, eventType, ip, from, to, order }) => {
  const and = [];
  if (userId) and.push({ userId });
  if (eventType?.length) and.push({ eventType: eventType.length === 1 ? eventType[0] : { [Op.in]: eventType } });
  if (ip) and.push({ ipAddress: ip });
  if (from) and.push({ createdAt: { [Op.gte]: from } });
  if (to) and.push({ createdAt: { [Op.lt]: to } });
  if (username) {
    const pattern = `%${escapeLike(username)}%`;
    and.push({ [Op.or]: [{ usernameAttempted: { [Op.iLike]: pattern } }, { '$user.username$': { [Op.iLike]: pattern } }] });
  }

  const direction = order === 'asc' ? 'ASC' : 'DESC';
  const { rows, count } = await AuthEvent.findAndCountAll({
    where: and.length ? { [Op.and]: and } : {},
    include: [
      {
        model: User,
        as: 'user',
        required: false,
        attributes: ['id', 'username', 'fullName'],
        include: [{ model: Role, as: 'role', attributes: ['code', 'name'] }],
      },
    ],
    order: [['createdAt', direction], ['id', direction]],
    limit,
    offset: (page - 1) * limit,
    // La condición sobre $user.username$ debe ir en la consulta principal, no en una subconsulta.
    subQuery: false,
  });
  return { items: rows.map(plain), total: count };
};
