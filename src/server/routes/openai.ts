import { Router, Request, Response, NextFunction } from 'express';
import ApiKeyManager from '../core/ApiKeyManager';
import RequestDispatcher from '../core/RequestDispatcher';
import GoogleApiForwarder, { GoogleApiError } from '../core/GoogleApiForwarder';
import config from '../config';

export default function createOpenAIRouter(
  apiKeyManager: ApiKeyManager,
  requestDispatcher: RequestDispatcher,
  googleApiForwarder: GoogleApiForwarder
): Router {
  const router = Router();

  async function handleStreamingResponse(stream: any, res: Response, apiKey: any): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    const reader = stream.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        
        const chunk = decoder.decode(value, { stream: true });
        res.write(chunk);
      }
    } catch (error) {
      console.error(`OpenAI Route: 流式响应处理错误 (${apiKey.key}):`, error);
    } finally {
      res.end();
    }
  }

  // Chat Completions endpoint
  router.post('/v1/chat/completions', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    let apiKey = null;
    try {
      console.log('OpenAI Route: 处理 /v1/chat/completions 请求');

      apiKey = await requestDispatcher.selectApiKey();
      if (!apiKey) {
        res.status(503).json({
          error: {
            code: 'no_available_keys',
            message: 'Service Unavailable: No available API keys.',
            type: 'unavailable_error',
          },
        });
        return;
      }

      console.info(`OpenAI Route: 使用 Key ${apiKey.key} 处理 chat completions 请求`);
      
      const forwardResult = await googleApiForwarder.forwardOpenAIRequest('/v1/chat/completions', req.body, apiKey);

      if (apiKey) {
        apiKeyManager.decrementRequestCount(apiKey.key);
      }

      if (forwardResult.error) {
        const err = forwardResult.error;
        console.error(`OpenAI Route: 转发请求时发生错误 (${apiKey.key}):`, err.message);

        if (err.isRateLimitError) {
          apiKeyManager.markAsCoolingDown(apiKey.key, config.KEY_COOL_DOWN_DURATION_MS);
        }
        
        res.status(err.statusCode || 500).json({
          error: {
            code: err.isRateLimitError ? 'rate_limit_exceeded' : 'api_error',
            message: err.message,
            type: err.isRateLimitError ? 'rate_limit_error' : 'api_error',
          },
        });
      } else if (forwardResult.stream) {
        console.info(`OpenAI Route: 处理流式响应 (${apiKey.key})`);
        await handleStreamingResponse(forwardResult.stream, res, apiKey);
      } else if (forwardResult.response) {
        console.info(`OpenAI Route: 处理非流式响应 (${apiKey.key})`);
        res.json(forwardResult.response);
      } else {
        console.error(`OpenAI Route: 未知转发结果 (${apiKey.key})`);
        res.status(500).json({
          error: {
            code: 'unknown_error',
            message: 'Unknown forwarding result.',
            type: 'api_error',
          },
        });
      }

    } catch (error) {
      console.error('OpenAI Route: 处理 chat completions 请求时发生未捕获的错误:', error);
      next(error);
    }
  });

  // Embeddings endpoint
  router.post('/v1/embeddings', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    let apiKey = null;
    try {
      console.log('OpenAI Route: 处理 /v1/embeddings 请求');

      apiKey = await requestDispatcher.selectApiKey();
      if (!apiKey) {
        res.status(503).json({
          error: {
            code: 'no_available_keys',
            message: 'Service Unavailable: No available API keys.',
            type: 'unavailable_error',
          },
        });
        return;
      }

      console.info(`OpenAI Route: 使用 Key ${apiKey.key} 处理 embeddings 请求`);
      
      const forwardResult = await googleApiForwarder.forwardOpenAIRequest('/v1/embeddings', req.body, apiKey);

      if (apiKey) {
        apiKeyManager.decrementRequestCount(apiKey.key);
      }

      if (forwardResult.error) {
        const err = forwardResult.error;
        console.error(`OpenAI Route: embeddings 请求错误 (${apiKey.key}):`, err.message);

        if (err.isRateLimitError) {
          apiKeyManager.markAsCoolingDown(apiKey.key, config.KEY_COOL_DOWN_DURATION_MS);
        }
        
        res.status(err.statusCode || 500).json({
          error: {
            code: err.isRateLimitError ? 'rate_limit_exceeded' : 'api_error',
            message: err.message,
            type: err.isRateLimitError ? 'rate_limit_error' : 'api_error',
          },
        });
      } else if (forwardResult.response) {
        console.info(`OpenAI Route: embeddings 响应 (${apiKey.key})`);
        res.json(forwardResult.response);
      } else {
        console.error(`OpenAI Route: embeddings 未知转发结果 (${apiKey.key})`);
        res.status(500).json({
          error: {
            code: 'unknown_error',
            message: 'Unknown forwarding result.',
            type: 'api_error',
          },
        });
      }

    } catch (error) {
      console.error('OpenAI Route: 处理 embeddings 请求时发生未捕获的错误:', error);
      next(error);
    }
  });

  // Models endpoint
  router.get('/v1/models', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    let apiKey = null;
    try {
      console.log('OpenAI Route: 处理 /v1/models 请求');

      apiKey = await requestDispatcher.selectApiKey();
      if (!apiKey) {
        res.status(503).json({
          error: {
            code: 'no_available_keys',
            message: 'Service Unavailable: No available API keys.',
            type: 'unavailable_error',
          },
        });
        return;
      }

      console.info(`OpenAI Route: 使用 Key ${apiKey.key} 处理 models 请求`);
      
      const forwardResult = await googleApiForwarder.forwardOpenAIRequest('/v1/models', null, apiKey, 'GET');

      if (apiKey) {
        apiKeyManager.decrementRequestCount(apiKey.key);
      }

      if (forwardResult.error) {
        const err = forwardResult.error;
        console.error(`OpenAI Route: models 请求错误 (${apiKey.key}):`, err.message);

        if (err.isRateLimitError) {
          apiKeyManager.markAsCoolingDown(apiKey.key, config.KEY_COOL_DOWN_DURATION_MS);
        }
        
        res.status(err.statusCode || 500).json({
          error: {
            code: err.isRateLimitError ? 'rate_limit_exceeded' : 'api_error',
            message: err.message,
            type: err.isRateLimitError ? 'rate_limit_error' : 'api_error',
          },
        });
      } else if (forwardResult.response) {
        console.info(`OpenAI Route: models 响应 (${apiKey.key})`);
        res.json(forwardResult.response);
      } else {
        console.error(`OpenAI Route: models 未知转发结果 (${apiKey.key})`);
        res.status(500).json({
          error: {
            code: 'unknown_error',
            message: 'Unknown forwarding result.',
            type: 'api_error',
          },
        });
      }

    } catch (error) {
      console.error('OpenAI Route: 处理 models 请求时发生未捕获的错误:', error);
      next(error);
    }
  });

  // Model retrieve endpoint
  router.get('/v1/models/:model', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    let apiKey = null;
    try {
      const modelId = req.params.model;
      console.log(`OpenAI Route: 处理 /v1/models/${modelId} 请求`);

      apiKey = await requestDispatcher.selectApiKey();
      if (!apiKey) {
        res.status(503).json({
          error: {
            code: 'no_available_keys',
            message: 'Service Unavailable: No available API keys.',
            type: 'unavailable_error',
          },
        });
        return;
      }

      console.info(`OpenAI Route: 使用 Key ${apiKey.key} 处理 model retrieve 请求`);
      
      const forwardResult = await googleApiForwarder.forwardOpenAIRequest(`/v1/models/${modelId}`, null, apiKey, 'GET');

      if (apiKey) {
        apiKeyManager.decrementRequestCount(apiKey.key);
      }

      if (forwardResult.error) {
        const err = forwardResult.error;
        console.error(`OpenAI Route: model retrieve 请求错误 (${apiKey.key}):`, err.message);

        if (err.isRateLimitError) {
          apiKeyManager.markAsCoolingDown(apiKey.key, config.KEY_COOL_DOWN_DURATION_MS);
        }
        
        res.status(err.statusCode || 500).json({
          error: {
            code: err.isRateLimitError ? 'rate_limit_exceeded' : 'api_error',
            message: err.message,
            type: err.isRateLimitError ? 'rate_limit_error' : 'api_error',
          },
        });
      } else if (forwardResult.response) {
        console.info(`OpenAI Route: model retrieve 响应 (${apiKey.key})`);
        res.json(forwardResult.response);
      } else {
        console.error(`OpenAI Route: model retrieve 未知转发结果 (${apiKey.key})`);
        res.status(500).json({
          error: {
            code: 'unknown_error',
            message: 'Unknown forwarding result.',
            type: 'api_error',
          },
        });
      }

    } catch (error) {
      console.error('OpenAI Route: 处理 model retrieve 请求时发生未捕获的错误:', error);
      next(error);
    }
  });

  // Image generation endpoint
  router.post('/v1/images/generations', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    let apiKey = null;
    try {
      console.log('OpenAI Route: 处理 /v1/images/generations 请求');

      apiKey = await requestDispatcher.selectApiKey();
      if (!apiKey) {
        res.status(503).json({
          error: {
            code: 'no_available_keys',
            message: 'Service Unavailable: No available API keys.',
            type: 'unavailable_error',
          },
        });
        return;
      }

      console.info(`OpenAI Route: 使用 Key ${apiKey.key} 处理 image generation 请求`);
      
      const forwardResult = await googleApiForwarder.forwardOpenAIRequest('/v1/images/generations', req.body, apiKey);

      if (apiKey) {
        apiKeyManager.decrementRequestCount(apiKey.key);
      }

      if (forwardResult.error) {
        const err = forwardResult.error;
        console.error(`OpenAI Route: image generation 请求错误 (${apiKey.key}):`, err.message);

        if (err.isRateLimitError) {
          apiKeyManager.markAsCoolingDown(apiKey.key, config.KEY_COOL_DOWN_DURATION_MS);
        }
        
        res.status(err.statusCode || 500).json({
          error: {
            code: err.isRateLimitError ? 'rate_limit_exceeded' : 'api_error',
            message: err.message,
            type: err.isRateLimitError ? 'rate_limit_error' : 'api_error',
          },
        });
      } else if (forwardResult.response) {
        console.info(`OpenAI Route: image generation 响应 (${apiKey.key})`);
        res.json(forwardResult.response);
      } else {
        console.error(`OpenAI Route: image generation 未知转发结果 (${apiKey.key})`);
        res.status(500).json({
          error: {
            code: 'unknown_error',
            message: 'Unknown forwarding result.',
            type: 'api_error',
          },
        });
      }

    } catch (error) {
      console.error('OpenAI Route: 处理 image generation 请求时发生未捕获的错误:', error);
      next(error);
    }
  });

  return router;
}