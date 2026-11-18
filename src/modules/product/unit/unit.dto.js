import { z } from 'zod';
import Decimal from 'decimal.js';

/** "208.000000" → "208"; "0.001000" → "0.001". El factor viaja como texto para no perder precisión. */
export const normalizeDecimal = (value) => new Decimal(value).toString();

export const UnitDto = z.object({
  id: z.number().int(),
  code: z.string(),
  name: z.string(),
  isActive: z.boolean(),
  isBase: z.boolean(),
  baseUnit: z.object({ id: z.number().int(), code: z.string(), name: z.string(), isActive: z.boolean() }).nullable(),
  conversionFactor: z.string(),
  // "1 TAMB = 208 L" (null en las unidades base).
  equivalence: z.string().nullable(),
  usage: z.object({
    activeProducts: z.number().int(),
    totalProducts: z.number().int(),
    activeDerivedUnits: z.number().int(),
    totalDerivedUnits: z.number().int(),
  }),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const toUnitDto = (unit) => {
  const factor = normalizeDecimal(unit.conversionFactor);
  const baseUnit = unit.baseUnit
    ? { id: unit.baseUnit.id, code: unit.baseUnit.code, name: unit.baseUnit.name, isActive: unit.baseUnit.isActive }
    : null;
  return UnitDto.parse({
    id: unit.id,
    code: unit.code,
    name: unit.name,
    isActive: unit.isActive,
    isBase: unit.baseUnitId === null,
    baseUnit,
    conversionFactor: factor,
    equivalence: baseUnit ? `1 ${unit.code} = ${factor} ${baseUnit.code}` : null,
    usage: {
      activeProducts: Number(unit.activeProducts ?? 0),
      totalProducts: Number(unit.totalProducts ?? 0),
      activeDerivedUnits: Number(unit.activeDerivedUnits ?? 0),
      totalDerivedUnits: Number(unit.totalDerivedUnits ?? 0),
    },
    createdAt: new Date(unit.createdAt),
    updatedAt: new Date(unit.updatedAt),
  });
};
