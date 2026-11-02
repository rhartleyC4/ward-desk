/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_WARD_TIME_ZONE?: string
  readonly VITE_ENABLE_GOOGLE?: string
  /** 'staging' on the training site, 'production' on the real one, unset locally. */
  readonly VITE_APP_ENV?: 'staging' | 'production' | ''
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
