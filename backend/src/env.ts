import { z } from "zod";

export const KB_BASE_PATH =
  process.env.KB_BASE_PATH ??
  "/Users/clausmedvesek/.paperclip/instances/default/companies/ca0d881e-94db-4279-94d8-198588aaaa34/knowledge-base";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET:   z.string().default(""),   // auto-generated if empty
  PORT:         z.coerce.number().default(3000),
  APP_URL:      z.string().default("http://localhost:8070"),
  // SMTP (optional — recovery email disabled without these)
  SMTP_HOST:    z.string().optional(),
  SMTP_PORT:    z.coerce.number().default(587),
  SMTP_USER:    z.string().optional(),
  SMTP_PASS:    z.string().optional(),
  // Google Drive folder structure
  GOOGLE_MASTER_FOLDER_ID:       z.string().default(""),  // master templates folder
  GOOGLE_APPLICATIONS_FOLDER_ID: z.string().default(""),  // parent for new app folders (empty = My Drive root)
});

export const env = envSchema.parse(process.env);
