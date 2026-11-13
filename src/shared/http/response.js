// Los controllers responden únicamente con estos helpers (ver .claude/references/responses.md).
// El formato de error lo produce solo el errorHandler.

/** Agrega claves a la línea de log de la petición (p. ej. { created: 'LUBR-0003' }). */
export const addLogContext = (res, context) => {
  res.locals.log = { ...res.locals.log, ...context };
};

export const sendOk = (res, data, { status = 200, meta } = {}) =>
  res.status(status).json(meta === undefined ? { success: true, data } : { success: true, data, meta });

export const sendCreated = (res, data) => sendOk(res, data, { status: 201 });

export const sendNoContent = (res) => res.status(204).end();

export const sendList = (res, items) => {
  addLogContext(res, { items: items.length });
  return sendOk(res, items, { meta: { count: items.length } });
};

export const sendPaginated = (res, { items, total, page, limit, filters = {}, search = null, sort }) => {
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  addLogContext(res, { items: `${items.length}/${total}`, page });
  return sendOk(res, items, {
    meta: {
      pagination: {
        page,
        limit,
        totalItems: total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
      filters,
      search: search ?? null,
      sort,
    },
  });
};
