import { createRequire } from 'node:module';
import { Sequelize } from 'sequelize';

const require = createRequire(import.meta.url);
const configs = require('./config.cjs');

export const env = process.env.NODE_ENV || 'development';
const config = configs[env] ?? configs.development;

export const sequelize = new Sequelize(config.database, config.username, config.password, config);
