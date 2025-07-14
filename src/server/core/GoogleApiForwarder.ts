import { GoogleGenerativeAI, GenerativeModel, GenerateContentResponse } from '@google/generative-ai';
import { ApiKey } from '../types';
import config from '../config';

// 定义一个简单的错误类型，用于传递 Google API 错误信息，特别是包含 Key 信息
export class GoogleApiError extends Error {
  statusCode?: number;
  apiKey?: string;
  isRateLimitError: boolean;

  constructor(message: string, statusCode?: number, apiKey?: string, isRateLimitError: boolean = false) {
    super(message);
    this.name = 'GoogleApiError';
    this.statusCode = statusCode;
    this.apiKey = apiKey;
    this.isRateLimitError = isRateLimitError;
  }
}

class GoogleApiForwarder {
  async forwardRequest(modelId: string, methodName: string, requestBody: any, apiKey: ApiKey): Promise<{ response?: any, stream?: AsyncIterable<GenerateContentResponse>, error?: GoogleApiError }> {
    const genAI = new GoogleGenerativeAI(apiKey.key);
    const generativeModel = genAI.getGenerativeModel({ model: modelId });

    try {
      let result;
      if (methodName === 'generateContent') {
        // 处理非流式请求
        result = await generativeModel.generateContent(requestBody);
        const response = result.response;
        console.info(`GoogleApiForwarder: 转发非流式请求到模型 ${modelId} 使用 Key ${apiKey.key}`);
        return { response };
      } else if (methodName === 'streamGenerateContent') {
        // 处理流式请求
        result = await generativeModel.generateContentStream(requestBody);
        console.info(`GoogleApiForwarder: 转发流式请求到模型 ${modelId} 使用 Key ${apiKey.key}`);
        return { stream: result.stream };
      } else if (methodName === 'countTokens') {
        // 处理 countTokens 请求
        result = await generativeModel.countTokens(requestBody);
        console.info(`GoogleApiForwarder: 转发 countTokens 请求到模型 ${modelId} 使用 Key ${apiKey.key}`);
        return { response: result };
      } else {
        // 理论上这部分代码不会被执行，因为 ProxyRoute 已经做了方法名验证
        // 但作为防御性编程，保留此处的错误处理
        const unsupportedMethodError = new GoogleApiError(
          `Unsupported API method: ${methodName}`,
          400, // Bad Request
          apiKey.key,
          false
        );
        console.error(`GoogleApiForwarder: 不支持的 API 方法 (${apiKey.key}):`, methodName);
        return { error: unsupportedMethodError };
      }

    } catch (error: any) {
      console.error(`GoogleApiForwarder: 调用 Google API 时发生错误 (${apiKey.key}):`, JSON.stringify(error));

      // 尝试识别速率限制错误 (HTTP 429) 或其他 Google API 错误
      const statusCode = error.response?.status || error.statusCode;
      const isRateLimit = statusCode === 429; // Google API 返回 429 表示速率限制

      // 创建自定义错误对象，包含 Key 信息和是否为速率限制错误
      const googleApiError = new GoogleApiError(
        `Google API Error: ${error.message}`,
        statusCode,
        apiKey.key,
        isRateLimit
      );

      return { error: googleApiError };
    }
  }

  async forwardOpenAIRequest(path: string, requestBody: any, apiKey: ApiKey, method: string = 'POST'): Promise<{ response?: any, stream?: any, error?: GoogleApiError }> {
    const baseUrl = 'https://generativelanguage.googleapis.com/v1beta/openai';
    const cleanPath = path.startsWith('/v1/') ? path.substring(3) : path;
    const url = `${baseUrl}${cleanPath}`;
    
    try {
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${apiKey.key}`,
        'Content-Type': 'application/json',
      };

      const fetchOptions: any = {
        method,
        headers,
      };

      if (method !== 'GET' && requestBody) {
        fetchOptions.body = JSON.stringify(requestBody);
      }

      console.info(`GoogleApiForwarder: 转发 OpenAI 兼容请求到 ${path} 使用 Key ${apiKey.key}`);
      
      const response = await fetch(url, fetchOptions);
      
      if (!response.ok) {
        const errorBody = await response.text();
        const isRateLimit = response.status === 429;
        
        const googleApiError = new GoogleApiError(
          `OpenAI Compatible API Error: ${response.status} ${response.statusText} - ${errorBody}`,
          response.status,
          apiKey.key,
          isRateLimit
        );
        
        return { error: googleApiError };
      }

      if (requestBody?.stream) {
        console.info(`GoogleApiForwarder: 处理 OpenAI 兼容流式响应 (${apiKey.key})`);
        return { stream: response.body };
      } else {
        const responseData = await response.json();
        console.info(`GoogleApiForwarder: 处理 OpenAI 兼容非流式响应 (${apiKey.key})`);
        return { response: responseData };
      }
      
    } catch (error: any) {
      console.error(`GoogleApiForwarder: 调用 OpenAI 兼容 API 时发生错误 (${apiKey.key}):`, JSON.stringify(error));
      
      const googleApiError = new GoogleApiError(
        `OpenAI Compatible API Error: ${error.message}`,
        error.statusCode || 500,
        apiKey.key,
        false
      );
      
      return { error: googleApiError };
    }
  }
}

export default GoogleApiForwarder;