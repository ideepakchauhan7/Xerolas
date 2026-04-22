declare module 'cloudflare:workers' {
  export interface DurableObjectState {
    storage: {
      get<T = unknown>(key: string): Promise<T | undefined>;
      put<T = unknown>(key: string, value: T): Promise<void>;
      delete(key: string): Promise<boolean>;
      list<T = unknown>(options?: { prefix?: string }): Promise<Map<string, T>>;
      getAlarm(): Promise<number | null>;
      setAlarm(scheduledTime: number | Date): Promise<void>;
    };
  }

  export abstract class DurableObject<Env = unknown> {
    protected readonly ctx: DurableObjectState;
    protected readonly env: Env;

    constructor(ctx: DurableObjectState, env: Env);
  }
}
