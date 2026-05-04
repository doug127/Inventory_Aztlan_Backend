import { z } from "zod";

export const categoryProductSchema = z.object({
    name: z.string()
        .min(1, "El campo 'name' no puede estar vacío")
        .max(100, "El campo 'name' no puede superar los 100 caracteres"),
    description: z.string()
        .max(255, "El campo 'description' no puede superar los 255 caracteres")
        .optional()
});