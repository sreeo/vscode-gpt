import { AxiosResponse, AxiosRequestConfig } from "axios";
import {
  CreateChatCompletionRequest,
  CreateChatCompletionResponse,
  CreateCompletionRequest,
} from "openai";

export interface APIClient<T> {
  createChatCompletion: (
    request: CreateChatCompletionRequest,
    options?: AxiosRequestConfig
  ) => Promise<AxiosResponse<T>>;
}

export interface OpenAIConfig {
  apiKey: string;
  organizationId: string;
}
