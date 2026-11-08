import type { Config } from '@netlify/functions';
import { env } from '../lib/env';
import { json } from '../lib/http';

/** GET /api/push-config: המפתח הציבורי (VAPID) להרשמה להתראות. ציבורי לפי תכנון. */
export default async (): Promise<Response> => json({ publicKey: env('VAPID_PUBLIC_KEY') ?? null });

export const config: Config = { path: '/api/push-config', method: 'GET' };
