import type { D1DatabaseLike, UserRecord } from '@shalcon/db';

export interface JobSignalQueueLike {
  send(message: unknown): Promise<void>;
}

export interface Env {
  DB?: D1DatabaseLike;
  APP_ENV: string;
  WEB_ORIGIN: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REDIRECT_URI?: string;
  SESSION_SECRET?: string;
  JOB_QUEUE?: JobSignalQueueLike;
}

export type Bindings = {
  Bindings: Env;
  Variables: { authUser: UserRecord };
};
