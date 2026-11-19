// Iconos que se pueden asignar a una categoría raíz (de productos o de activos). Son los nombres de
// lucide (https://lucide.dev) en kebab-case; el frontend tiene el mismo catálogo en
// frontend/src/components/common/categoryIcons.jsx. Al agregar uno aquí, agréguelo también allá.
// Las subcategorías no guardan icono: muestran el de su raíz.
export const CATEGORY_ICONS = Object.freeze([
  // Vehículos y maquinaria
  'tractor', 'truck', 'car-front', 'bus', 'forklift', 'construction', 'bike', 'ship',
  // Personas
  'users', 'user', 'hard-hat', 'handshake', 'briefcase',
  // Campo y cultivos
  'wheat', 'sprout', 'leaf', 'trees', 'land-plot', 'fence', 'map-pin', 'mountain', 'sun', 'cloud-rain',
  'grape', 'citrus', 'carrot', 'flower-2', 'paw-print', 'beef', 'bird', 'fish',
  // Taller e instalaciones
  'wrench', 'hammer', 'drill', 'cog', 'shovel', 'pickaxe', 'axe', 'scissors', 'warehouse', 'factory',
  'building-2', 'house', 'store', 'tent', 'landmark',
  // Insumos y materiales
  'fuel', 'droplet', 'droplets', 'flask-conical', 'spray-can', 'bug', 'package', 'boxes', 'container',
  'cylinder', 'paint-bucket', 'recycle', 'shirt', 'shield-check', 'fire-extinguisher', 'pill',
  // Energía y medición
  'zap', 'plug', 'cable', 'battery-charging', 'lightbulb', 'gauge', 'thermometer', 'waves',
  // Genéricos
  'tag', 'layers', 'shapes',
]);

export const CATEGORY_ICON_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
