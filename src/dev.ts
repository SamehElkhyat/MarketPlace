import { createApp } from './app';
import { env } from './config/env';
import { connectDb } from './lib/db';
import { logger } from './lib/logger';

await connectDb();
createApp().listen(env.PORT, () => logger.info(`API listening on http://localhost:${env.PORT}`));
