import { EmailOutbox } from '#src/database/models/index.model.js';

const plain = (row) => (row ? row.get({ plain: true }) : null);

export const createEmail = async (data, { transaction } = {}) => plain(await EmailOutbox.create(data, { transaction }));
