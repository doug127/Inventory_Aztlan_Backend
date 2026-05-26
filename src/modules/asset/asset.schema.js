import { z } from "zod";

export const assetSchema = z.object({
    name: z.string()
        .min(1, "El campo nombre es obligatorio")
        .max(20, "El campo nombre no puede superar 20 caracteres")
});