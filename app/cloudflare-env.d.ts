declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    LLM_DATA?: R2Bucket;
    LLM_WORKER?: Fetcher;
    LLM_WORKER_URL?: string;
    LLM_WORKER_TOKEN?: string;
    LLM_HEALTH_PATH?: string;
    GYM_SINGLE_USER_MODE?: string;
    GYM_SINGLE_USER_ID?: string;
    GYM_SINGLE_USER_EMAIL?: string;
  }
}
