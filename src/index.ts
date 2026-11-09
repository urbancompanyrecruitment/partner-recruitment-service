import { buildApp } from './app.js';
import { config } from './common/config/index.js';
import { logger } from './common/logger.js';
import { LISTEN_HOST } from './constant.js';

const app = await buildApp();

await app.listen({ port: config.port, host: LISTEN_HOST });

logger.info({ method: 'main', key_1: 'port', key_1_value: String(config.port), key_2: 'env', key_2_value: config.nodeEnv });
