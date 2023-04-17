import { ConversationsHistoryResponse, Message } from "@slack/web-api/dist/response/ConversationsHistoryResponse";
import axios, { AxiosRequestConfig } from "axios";
import {
    ConversationsListResponse,
    Channel,
    
  } from "@slack/web-api/dist/response/ConversationsListResponse";

export interface SlackConfig {
    accessToken: string;
  }
  
  export interface DustConfig {
    username: string;
    datasourceId: string;
    APIKey: string;
  }

