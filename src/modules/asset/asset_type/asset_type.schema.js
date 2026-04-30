import {z} from "zod";

export const assetTypeSchema = z.object({
    name: z.string()
        .min(1, "El campo 'name' es obligatorio")
        .max(20, "El campo 'name' no puede superar 20 caracteres"),
    description: z.string()
        .max(50, "El campo descripción no puede superar 50 caracteres")
        .optional()
});