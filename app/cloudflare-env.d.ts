declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    GYM_SINGLE_USER_MODE?: string;
    GYM_SINGLE_USER_ID?: string;
    GYM_SINGLE_USER_EMAIL?: string;
  }
}
