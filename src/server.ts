import express from 'express';
import http from 'http';
import dotenv from 'dotenv';
import config from './server/config';
import createProxyRouter from './server/routes/proxy';
import errorHandler from './server/middlewares/errorHandler';
import ApiKeyManager from './server/core/ApiKeyManager';
import RequestDispatcher from './server/core/RequestDispatcher';
import GoogleApiForwarder from './server/core/GoogleApiForwarder';
import { StreamHandler } from './server/core/StreamHandler';

dotenv.config();

const app = express();
const port = config.PORT;

const apiKeysEnv = process.env.GEMINI_API_KEYS;
if (!apiKeysEnv) {
  console.error('GEMINI_API_KEYS environment variable is not set. Please add your API keys to .env file.');
  process.exit(1);
}

const apiKeys = apiKeysEnv.split(',').map(key => key.trim()).filter(key => key.length > 0);

if (apiKeys.length === 0) {
  console.error('No valid API keys found in GEMINI_API_KEYS environment variable.');
  process.exit(1);
}

console.log(`Loaded ${apiKeys.length} API keys from environment`);

const apiKeyManager = new ApiKeyManager(apiKeys);
const googleApiForwarder = new GoogleApiForwarder();
const streamHandler = new StreamHandler();
const requestDispatcher = new RequestDispatcher(apiKeyManager);

const proxyRouter = createProxyRouter(apiKeyManager, requestDispatcher, googleApiForwarder, streamHandler);

app.use(express.json({ limit: '8mb' }));
app.use('/', proxyRouter);
app.use(errorHandler);

const server = http.createServer(app);

server.listen(port, () => {
  console.log(`Gemini API Key Aggregator Proxy Server running on port ${port}`);
  console.log(`Using ${apiKeys.length} API keys for load balancing`);
}).on('error', (err: any) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Please stop the existing server or change the port.`);
  } else {
    console.error('Failed to start proxy server:', err);
  }
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  server.close(() => {
    console.log('Server stopped.');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\nShutting down server...');
  server.close(() => {
    console.log('Server stopped.');
    process.exit(0);
  });
});