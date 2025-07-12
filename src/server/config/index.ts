import dotenv from 'dotenv';

dotenv.config();

interface Config {
  PORT: number;
  KEY_COOL_DOWN_DURATION_MS: number;
  LOG_LEVEL: string;
  DISPATCH_STRATEGY: string;
}

const config: Config = {
  PORT: parseInt(process.env.PORT || '3145', 10),
  KEY_COOL_DOWN_DURATION_MS: parseInt(process.env.KEY_COOL_DOWN_DURATION_MS || '60000', 10),
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  DISPATCH_STRATEGY: process.env.DISPATCH_STRATEGY || 'round_robin',
};

// 导出配置对象
export default config;