/** Build-time constants injected by esbuild (see scripts/esbuild.shared.mjs). */
declare const __BUILD_MODE__: 'development' | 'production';
declare const __E2E__: boolean;
declare const __APP_VERSION__: string;
/** '' for the local helper, or e.g. '/api' when the site hosts its own helper. */
declare const __AI_HELPER_URL__: string;

declare module '*.woff' {
  const url: string;
  export default url;
}
declare module '*.css';
