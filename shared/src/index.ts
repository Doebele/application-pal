import { z } from "zod";
export * from "./schema.js";

export const healthSchema = z.object({
  status: z.literal("ok"),
  timestamp: z.string()
});

export type HealthResponse = z.infer<typeof healthSchema>;
