// Integración de los documentos de recepción de una entrada (HU-402, ajuste) sobre inventory_test con la
// app real: facturas, vales y recibos registrados con la entrada, su archivo escaneado (subida, descarga
// y una sola vez) y la inmutabilidad en la base de datos (trg_movement_documents_rules). Los archivos se
// escriben en una carpeta temporal (FILE_STORAGE_DIR).
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { QueryTypes } from 'sequelize';
import app from '#src/app.js';
import { sequelize } from '#src/config/database.js';
import { startServer } from '../../helpers/http.js';
import { assertTestDatabase, createTestUser, deleteTestUsers } from '../../helpers/db.js';

let api;
let storageDir;
const tokens = {};
const ids = {};

const BASE = '/api/movements';
const PDF = Buffer.from('%PDF-1.7\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('resto de la imagen')]);

const one = async (sql, replacements) => (await sequelize.query(sql, { replacements, type: QueryTypes.SELECT }))[0];
const tokenOf = async (user) =>
  (await api.post('/api/auth/login', { body: { username: user.username, password: user.password } })).body.data.accessToken;

const enter = (body, token = tokens.almacenista) => api.post(`${BASE}/entries`, { token, body });
const entry = (documents, overrides = {}) => ({ warehouseId: ids.prin, reason: 'COMPRA', lines: [{ productId: ids.product, quantity: 10 }], documents, ...overrides });
const upload = (movementId, documentId, buffer, { token = tokens.almacenista, type = 'application/pdf', name = 'Factura 0012345.pdf' } = {}) =>
  api.put(`${BASE}/${movementId}/documents/${documentId}/file`, {
    token,
    body: buffer,
    headers: { 'Content-Type': type, 'X-File-Name': encodeURIComponent(name) },
  });
const storedFiles = async () => readdir(path.join(storageDir, 'receipt-documents')).catch(() => []);

/** Los movimientos y sus documentos son inmutables: los triggers se apagan solo durante el borrado y solo en *_test. */
const cleanup = async () => {
  assertTestDatabase();
  await sequelize.transaction(async (transaction) => {
    const q = (sql) => sequelize.query(sql, { transaction });
    const testHeaders = `SELECT h.id FROM movement_headers h JOIN users u ON u.id = h.created_by_user_id WHERE u.username LIKE 'test.%'`;
    await q('ALTER TABLE movement_documents DISABLE TRIGGER trg_movement_documents_rules');
    await q('ALTER TABLE movement_lines DISABLE TRIGGER trg_movements_immutable');
    await q('ALTER TABLE movement_headers DISABLE TRIGGER trg_movements_immutable');
    await q(`DELETE FROM movement_documents WHERE movement_header_id IN (${testHeaders})`);
    await q(`DELETE FROM movement_lines WHERE movement_header_id IN (${testHeaders})`);
    await q(`DELETE FROM movement_headers WHERE id IN (${testHeaders})`);
    await q('ALTER TABLE movement_documents ENABLE TRIGGER trg_movement_documents_rules');
    await q('ALTER TABLE movement_lines ENABLE TRIGGER trg_movements_immutable');
    await q('ALTER TABLE movement_headers ENABLE TRIGGER trg_movements_immutable');
  });
  await sequelize.query("DELETE FROM stock WHERE product_id IN (SELECT id FROM products WHERE name LIKE 'test.%')");
  await sequelize.query("DELETE FROM products WHERE name LIKE 'test.%'");
};

beforeAll(async () => {
  assertTestDatabase();
  storageDir = await mkdtemp(path.join(tmpdir(), 'aztlan-docs-'));
  process.env.FILE_STORAGE_DIR = storageDir;
  await cleanup();
  await deleteTestUsers();
  api = await startServer(app);
  const users = {
    admin: await createTestUser({ name: 'doc.admin', roleCode: 'ADMIN' }),
    almacenista: await createTestUser({ name: 'doc.alm', roleCode: 'ALMACENISTA' }),
    otroAlmacenista: await createTestUser({ name: 'doc.alm2', roleCode: 'ALMACENISTA' }),
    usuario: await createTestUser({ name: 'doc.usr', roleCode: 'USUARIO' }),
  };
  for (const [key, user] of Object.entries(users)) tokens[key] = await tokenOf(user);
  ids.prin = (await one("SELECT id FROM warehouses WHERE code = 'PRIN'")).id;
  ids.product = (
    await one(
      `INSERT INTO products (code, name, product_category_id, unit_id, min_stock)
       VALUES ('COMB-9921', 'test.Diésel con factura', (SELECT id FROM product_categories WHERE code = 'COMB'), (SELECT id FROM units WHERE code = 'L'), 0) RETURNING id`
    )
  ).id;
});

afterAll(async () => {
  await api?.close();
  await cleanup();
  await deleteTestUsers();
  await sequelize.close();
  delete process.env.FILE_STORAGE_DIR;
  if (storageDir) await rm(storageDir, { recursive: true, force: true });
});

describe('Documentos de recepción con la entrada', () => {
  it('registra la factura y la guía con sus datos; la referencia sale de la primera y el prefijo escrito se quita', async () => {
    const res = await enter(
      entry([
        { documentType: 'FACTURA', documentNumber: ' fac-0012345 ', supplierName: 'test.Agro Sur C.A.', supplierTaxId: 'j-12345678-9', issueDate: '2026-11-20', totalAmount: '1250,5', currency: 'usd' },
        { documentType: 'GUIA_DESPACHO', documentNumber: '998' },
      ])
    );
    expect(res.status).toBe(201);
    expect(res.body.data.reference).toBe('FAC-0012345');
    expect(res.body.data.documents).toEqual([
      expect.objectContaining({
        documentType: 'FACTURA',
        documentNumber: '0012345',
        label: 'FAC-0012345',
        supplierName: 'test.Agro Sur C.A.',
        supplierTaxId: 'J-12345678-9',
        issueDate: '2026-11-20',
        totalAmount: '1250.50',
        currency: 'USD',
        file: null,
      }),
      expect.objectContaining({ documentType: 'GUIA_DESPACHO', label: 'GD-998', supplierName: null, totalAmount: null, file: null }),
    ]);
    ids.movement = res.body.data.id;
    [ids.factura, ids.guia] = res.body.data.documents.map((d) => d.id);

    // El detalle los devuelve en el mismo orden, y una entrada sin documentos devuelve la lista vacía.
    expect((await api.get(`${BASE}/${ids.movement}`, { token: tokens.usuario })).body.data.documents.map((d) => d.label)).toEqual(['FAC-0012345', 'GD-998']);
    expect((await enter(entry(undefined))).body.data).toMatchObject({ documents: [], reference: null });
  });

  it('validaciones: tipo desconocido, número con símbolos, moneda sin monto, repetido y fecha futura → 400 en el documento', async () => {
    const bad = async (documents, path) => {
      const res = await enter(entry(documents));
      expect(res.status, path).toBe(400);
      expect(res.body.error.details, path).toEqual(expect.arrayContaining([expect.objectContaining({ path })]));
    };
    await bad([{ documentType: 'BOLETA', documentNumber: '1' }], 'documents.0.documentType');
    await bad([{ documentType: 'VALE', documentNumber: 'N° 15/2' }], 'documents.0.documentNumber');
    await bad([{ documentType: 'RECIBO', documentNumber: '15', currency: 'USD' }], 'documents.0.currency');
    await bad([{ documentType: 'VALE', documentNumber: '15' }, { documentType: 'VALE', documentNumber: 'VAL-15' }], 'documents.1.documentNumber');
    await bad([{ documentType: 'RECIBO', documentNumber: '16', issueDate: '2999-01-01' }], 'documents.0.issueDate');
    // El mismo número con otro tipo sí se admite.
    expect((await enter(entry([{ documentType: 'VALE', documentNumber: '15' }, { documentType: 'RECIBO', documentNumber: '15' }]))).status).toBe(201);
  });
});

describe('Archivo escaneado del documento', () => {
  it('lo adjunta quien registró la entrada; se descarga igual, con su sha256, y se ve en el detalle', async () => {
    const res = await upload(ids.movement, ids.factura, PDF);
    expect(res.status).toBe(200);
    expect(res.body.data.file).toMatchObject({
      name: 'Factura 0012345.pdf',
      mimeType: 'application/pdf',
      sizeBytes: PDF.length,
      sha256: createHash('sha256').update(PDF).digest('hex'),
    });
    expect(await storedFiles()).toHaveLength(1);

    const download = await api.get(`${BASE}/${ids.movement}/documents/${ids.factura}/file?disposition=attachment`, { token: tokens.usuario });
    expect(download.status).toBe(200);
    expect(download.headers.get('content-type')).toBe('application/pdf');
    expect(download.headers.get('content-disposition')).toContain("attachment; filename=\"Factura 0012345.pdf\"; filename*=UTF-8''Factura%200012345.pdf");
    expect(download.buffer.equals(PDF)).toBe(true);

    const detail = await api.get(`${BASE}/${ids.movement}`, { token: tokens.usuario });
    expect(detail.body.data.documents[0].file).toMatchObject({ name: 'Factura 0012345.pdf', uploadedBy: { fullName: expect.any(String) } });
  });

  it('una sola vez: el segundo archivo → DOCUMENT_FILE_EXISTS y no queda en disco', async () => {
    const res = await upload(ids.movement, ids.factura, PDF);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DOCUMENT_FILE_EXISTS');
    expect(await storedFiles()).toHaveLength(1);
  });

  it('dos subidas simultáneas al mismo documento: una gana y la otra no deja archivo', async () => {
    const [a, b] = await Promise.all([upload(ids.movement, ids.guia, PNG, { type: 'image/png', name: 'guia.png' }), upload(ids.movement, ids.guia, PDF)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await storedFiles()).toHaveLength(2);
  });

  it('el contenido no coincide con el tipo, tipo no permitido o sin nombre → 400; más de 10 MB → 413', async () => {
    const created = await enter(entry([{ documentType: 'RECIBO', documentNumber: '777' }]));
    const [doc] = created.body.data.documents;
    const id = created.body.data.id;

    const fake = await upload(id, doc.id, Buffer.from('no soy un pdf'));
    expect(fake.body.error.code).toBe('DOCUMENT_FILE_INVALID');
    const text = await upload(id, doc.id, Buffer.from('hola'), { type: 'text/plain' });
    expect(text.status).toBe(400);
    expect(text.body.error.details).toEqual([expect.objectContaining({ location: 'headers', path: 'content-type' })]);
    const noName = await api.put(`${BASE}/${id}/documents/${doc.id}/file`, { token: tokens.almacenista, body: PDF, headers: { 'Content-Type': 'application/pdf' } });
    expect(noName.body.error.details).toEqual([expect.objectContaining({ path: 'x-file-name' })]);
    const huge = await upload(id, doc.id, Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]));
    expect(huge.status).toBe(413);
    expect(huge.body.error.code).toBe('DOCUMENT_FILE_TOO_LARGE');

    // Sigue libre para el archivo correcto.
    expect((await upload(id, doc.id, PDF)).status).toBe(200);
  });

  it('permisos: otro ALMACENISTA → 403, USUARIO → 403, un ADMIN sí; documento de otro movimiento o sin archivo → 404', async () => {
    const created = await enter(entry([{ documentType: 'VALE', documentNumber: '501' }, { documentType: 'VALE', documentNumber: '502' }]));
    const id = created.body.data.id;
    const [first, second] = created.body.data.documents;

    expect((await upload(id, first.id, PDF, { token: tokens.otroAlmacenista })).body.error.code).toBe('FORBIDDEN_ROLE');
    expect((await upload(id, first.id, PDF, { token: tokens.usuario })).status).toBe(403);
    expect((await upload(id, first.id, PDF, { token: tokens.admin })).status).toBe(200);
    expect((await upload(ids.movement, first.id, PDF)).status).toBe(404);
    expect((await api.get(`${BASE}/${id}/documents/${second.id}/file`, { token: tokens.almacenista })).status).toBe(404);
  });
});

describe('Inmutabilidad en la base de datos (trg_movement_documents_rules)', () => {
  it('no se modifican los datos, no se cambia el archivo, no se borran y solo van en entradas', async () => {
    const reject = (sql) => expect(sequelize.query(sql, { replacements: { id: ids.factura } })).rejects.toThrow();
    await reject("UPDATE movement_documents SET document_number = '999' WHERE id = :id");
    await reject("UPDATE movement_documents SET file_original_name = 'otro.pdf' WHERE id = :id");
    await reject('DELETE FROM movement_documents WHERE id = :id');

    const withdrawal = await one("SELECT id FROM movement_headers WHERE movement_type = 'OUT' LIMIT 1");
    if (withdrawal) {
      await expect(
        sequelize.query("INSERT INTO movement_documents (movement_header_id, document_type, document_number) VALUES (:id, 'VALE', '1')", { replacements: { id: withdrawal.id } })
      ).rejects.toThrow(/solo las entradas/);
    }
    const row = await one('SELECT document_number AS n, file_original_name AS f FROM movement_documents WHERE id = :id', { id: ids.factura });
    expect(row).toEqual({ n: '0012345', f: 'Factura 0012345.pdf' });
  });
});
