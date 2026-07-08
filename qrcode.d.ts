declare module 'qrcode' {
  export function toDataURL(text: string, opts?: { width?: number; margin?: number }): Promise<string>;
}
