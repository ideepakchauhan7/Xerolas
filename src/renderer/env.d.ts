import type { DesktopAssistantApi } from '../shared/types';

declare global {
  interface Window {
    desktopAssistant: DesktopAssistantApi;
  }
}

export {};
