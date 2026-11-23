# Código heredado (esquema anterior)

Archivos retirados del backend al reescribir movimientos y stock en HU-401 (2026-11-22). Apuntan a
tablas que el esquema nuevo eliminó (`movement_types`, `reasons`, `movement_targets`) o a columnas que
cambiaron (`stock.id`, `datetime`, cantidades `FLOAT`). No se cargan ni se prueban: `vitest.config.js`
excluye esta carpeta. Se conservan solo como referencia, porque el proyecto no está en git.

- `src/modules/movement/` y `src/modules/stock/`: módulos anteriores.
- `tests/dtos/` y `tests/services/`: sus 14 archivos de prueba, que ya no cargaban.
