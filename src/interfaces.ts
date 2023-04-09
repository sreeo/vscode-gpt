import { AxiosResponse } from 'axios';
import { CreateChatCompletionRequest, CreateChatCompletionResponse } from 'openai';

export interface APIClient {
    createChatCompletion: (request: CreateChatCompletionRequest) => Promise<AxiosResponse<CreateChatCompletionResponse>>;
}