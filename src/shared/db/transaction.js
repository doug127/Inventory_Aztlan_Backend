import { sequelize } from '#src/config/database.js';

/**
 * Ejecuta fn dentro de una transacción. Si ya se recibe una (llamada anidada), la reutiliza.
 * Las transacciones se abren en el service; los repositories solo reciben { transaction }.
 */
export const withTransaction = (fn, { transaction } = {}) =>
  transaction ? fn(transaction) : sequelize.transaction((t) => fn(t));
