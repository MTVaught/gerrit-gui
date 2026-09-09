declare module '*?asset' {
  const path: string
  export default path
}

/** Short git commit the build was made from; set by `define` in electron.vite.config.ts. */
declare const __BUILD_COMMIT__: string
