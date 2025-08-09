import { z } from 'zod';

const envSchema = z.object({
  ENCRYPTION_KEY: z.string().optional(),
  API_TOKEN: z.string().optional(),
  DB_PATH: z.string().optional(),
  LOG_PATH: z.string().optional(),
  HUGGINGFACE_API_KEY: z.string().optional(),
  RATE_LIMIT_MAX: z.coerce.number().optional(),
});

export const config = envSchema.parse(process.env);
