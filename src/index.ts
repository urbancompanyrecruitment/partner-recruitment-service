import Fastify from 'fastify';
import { buildApp, fastifyOptions } from './buildApp.js';
import { config } from './common/config/index.js';
import { logger } from './common/logger.js';
import { LISTEN_HOST } from './constant.js';

const app = await buildApp(Fastify(fastifyOptions()));

logger.info({ method: 'main', message: 'Routes registered, starting the server', key_1: 'env', key_1_value: config.nodeEnv });

app
  .listen({ port: config.port, host: LISTEN_HOST })
  .then(() => {
    logger.info({ method: 'main', key_1: 'port', key_1_value: String(config.port), key_2: 'env', key_2_value: config.nodeEnv });
  })
  .catch((error: Error) => {
    logger.error({ method: 'main', message: 'Server failed to start', error: error?.message || error?.stack });

    process.exit(1);
  });
