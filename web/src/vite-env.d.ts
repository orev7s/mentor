/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** GitHub repo that publishes web bundles as releases, as `owner/repo`. */
  readonly VITE_UPDATE_REPO?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}