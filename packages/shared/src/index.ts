export const PRODUCT_NAME = 'Shalcon Demo-First Outbound Engine' as const;
export const PRODUCT_VERSION = '0.1.0' as const;

export type HealthStatus = {
  ok: boolean;
  service: string;
  phase: number;
};
