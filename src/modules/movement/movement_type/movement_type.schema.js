import { z } from "zod";

export const MovementTypeSchema = z.object({
    type: z.string()
        .min(1, "El campo tipo no puede estar vacío")
        .max(50, "El campo tipo no puede superar 50 caracteres")
});