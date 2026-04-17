import { RegisterRequest } from "proto/auth.pb";

export interface RegisterPayload extends RegisterRequest {
  sagaId: string;
  authId: number;
}