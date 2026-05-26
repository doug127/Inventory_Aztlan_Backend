import { z } from "zod";

export const reasonSchema = z.object({
    type: z.string()
        .min(1, "El campo 'type' no puede estar vacío")
        .max(100, "El campo 'type' no puede superar 100 caracteres")
});