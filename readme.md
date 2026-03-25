
# Patron de Diseño de Software
    Layered:
        Controller -> Service + Validación -> Repositorio -> Model

# Base de datos
## Tablas y Campos
- privileges: id, name (TEXT), description (TEXT)
- roles: id, name (TEXT), description (TEXT), hierarchy (INT)
- role_privileges (Tabla Pivote): role_id (FK), privilege_id (FK), PK (role_id, privilege_id)
- users: id, username (TEXT), password (TEXT), full_name (TEXT), role_id (TEXT), is_active (BOOLEAN)
- movement_headers: id, movement_type (ENUM: 'IN', 'OUT', 'TRANSFER', 'ADJUST'), 
  reason (ENUM: 'CONSUMO', 'PRESTAMO', 'DESECHO', 'COMPRA', 'VENTA', 'TRASLADO', 'AJUSTE', 'OTRO'), 
  reference (TEXT), datetime (INDEX, TIMESTAMP), created_by_user_id (FK),
  warehouse_from_id (FK, NULLABLE), warehouse_to_id (FK, NULLABLE), note (TEXT)
- warehouses: id, code (VARCHAR(4)), name (TEXT)
- stock: 
- product_categories: id, name (TEXT), description (TEXT), parent_id (FK de product_categories_id)
- units: id, name (TEXT), code (TEXT), base_unit_id (FK, NULLABLE), conversion_factor (NUMBER), 
  is_active (BOOLEAN)
- products: id, code (TEXT), name (TEXT), product_category_id (FK), unit_id (FK), min_stock (NUMBER), 
  max_stock (NUMBER), is_active (BOOLEAN)
- stock (TABLA_PIVOTE): product_id (FK), warehouse_id (FK), quantity (INDEX, NUMBER), 
  last_update (INDEX, TIMESTAMP), PK (product_id, warehouse_id)
- movement_lines: id (PK), movement_header_id (FK), product_id (FK), quantity (CHECK NUMBER > 0), note (TEXT)
- assets: id, code (VARCHAR(4), UNIQUE), name (TEXT), asset_type (ENUM('VEHICulo', 'PERSONAL', 'CAMPO', 'COSECHA', 'TALLER', 'EXTERNO', 'OTRO')), description (TEXT), active (BOOLEAN)
- movement_targets: movement_header_id (FK), assset_id (FK), id (PK (movement_header_id, asset_id))
## Relaciones
- privilegies M - N roles (tabla pivote role_privilegies) 
- roles 1 - M users 
- users 1 - M movement_headers 
- movement_headers M - 1 warehouses 
- warehouse_categories 1 - M warehouses 
- warehouses 1 - M stock 
- stock M - 1 products 
- products M - 1 product_categories 
- products M - 1 units
- movement_lines M - 1 products 
- movement_lines M - 1 movement_headers 
- movement_headers 1 - M movement_targets
- movement_targets M - 1 assets
        
# Orden de desarrollo de modulos
- [x] 1 /auth/me
- [x] 2 CRUD users
<!-- - [ ] 3.1 Categorías de Almacenes -->
- [x] 3 Almacenes
- [x] 4.1 Categoría de Productos
- [x] 4.2 Unidades
- [x] 4.3 Productos
- [x] 5 Stock
- [ ] 6 Movimientos
- [ ] 7 Activos
- [ ] 8 Destino de Movimientos
- [ ] 9 Reportes

# Cada modulo cuenta con su carpeta de testing para validar pruebas de forma automatizada.

# Previsiones
Reglas y validaciones que deben estar en el service (ordenadas por prioridad)
## Prioridad Alta 
1. Validar movement_type y requerir warehouse_from_id / warehouse_to_id según tipo.
2. Validar quantity > 0 en cada línea.
3. Para OUT/TRANSFER: verificar stock >= qty antes de decrementar.
4. Ejecutar todo el flujo de creación del movimiento dentro de una transacción.
5. Usar row-level locking (SELECT ... FOR UPDATE) en filas de stock para evitar race conditions.
6. Registrar un audit log línea por línea (user, movement_id, product_id, qty_old, qty_new).

## Prioridad Media
7. Validar existencia y active de productos/almacenes/usuarios.
8. Normalizar inputs (ej. sku uppercase, username lowercase).
9. Validar permisos del currentUser (privilegios + jerarquía) en el service, no solo en middleware.
10. Validar que no se pueda eliminar/editar un superadmin sin privilegios superiores.

## Prioridad Baja / Evolutiva
11. Idempotencia (request idempotency keys para evitar duplicados).
12. Colas para altas tasas (si scaling futuro).
13. Tests automáticos que simulen concurrencia.

## Reglas de Negocio para movement_type
### IN
- warehouse_to_id requerido
- warehouse_from_id NULL
- movement_targets NO permitido

### OUT
- warehouse_from_id requerido
- warehouse_to_id NULL
- movement_targets requerido si reason = CONSUMO / PRESTAMO

### TRANSFER
- warehouse_from_id requerido
- warehouse_to_id requerido
- movement_targets NO permitido

### ADJUST
- warehouse_from_id requerido
- warehouse_to_id
- movement_targets


# Sugerencias
- Corregir capa repository ya que no se debe validar nada desde allí, solo se debe establecer conexión con el modelo