
declare const __APP_VERSION__: string;
declare const __APP_SEMVER__: string;
declare const __APP_BUILD_TIME__: string;

declare module '*.png' {
  const src: string;
  export default src;
}
