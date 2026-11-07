/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_WARD_TIME_ZONE?: string
  /** The ward's name, shown in the header and as the installed app's name. Defaults to Ward Desk. */
  readonly VITE_WARD_NAME?: string
  readonly VITE_ENABLE_GOOGLE?: string
  /** Web Push key for this environment (scripts/write-local-env.mjs makes one locally). */
  readonly VITE_VAPID_PUBLIC_KEY?: string
  /** 'staging' on the training site, 'production' on the real one, unset locally. */
  readonly VITE_APP_ENV?: 'staging' | 'production' | ''
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** The commit this build was made from (vite.config.ts), sent with error reports. */
declare const __APP_VERSION__: string
