// Levanta una app Express en un puerto efímero y ofrece un cliente con fetch (sin supertest).
// fetch no guarda cookies: se envían con { cookie } y se leen de la respuesta con readCookie().

/** Interpreta un header Set-Cookie en { name, value, attributes } (atributos en minúsculas). */
export const parseSetCookie = (header) => {
  const [pair, ...attrs] = header.split(';').map((part) => part.trim());
  const index = pair.indexOf('=');
  const attributes = {};
  for (const attr of attrs) {
    const [key, ...rest] = attr.split('=');
    attributes[key.toLowerCase()] = rest.length ? rest.join('=') : true;
  }
  return { name: pair.slice(0, index), value: decodeURIComponent(pair.slice(index + 1)), attributes };
};

export const startServer = async (app) => {
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const request = async (method, path, { body, token, cookie, headers = {} } = {}) => {
    const res = await fetch(baseUrl + path, {
      method,
      headers: {
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
        ...(cookie && { Cookie: cookie }),
        ...headers,
      },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const text = await res.text();
    const cookies = res.headers.getSetCookie().map(parseSetCookie);
    return {
      status: res.status,
      headers: res.headers,
      body: text ? JSON.parse(text) : null,
      cookies,
      readCookie: (name) => cookies.find((c) => c.name === name) ?? null,
    };
  };

  return {
    baseUrl,
    get: (path, options) => request('GET', path, options),
    post: (path, options) => request('POST', path, options),
    patch: (path, options) => request('PATCH', path, options),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
};
