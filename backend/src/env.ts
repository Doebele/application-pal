import { z } from "zod";

export const KB_BASE_PATH =
  process.env.KB_BASE_PATH ??
  "/Users/clausmedvesek/.paperclip/instances/default/companies/ca0d881e-94db-4279-94d8-198588aaaa34/knowledge-base";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  PORT: z.coerce.number().default(3000)
});

export const env = envSchema.parse(process.env);
