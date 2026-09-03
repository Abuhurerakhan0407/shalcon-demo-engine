export interface ProviderAdapter {
  readonly name: string;
  health(): Promise<{ ok: boolean }>;
}
