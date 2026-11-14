/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />
import type { ApiCanchas } from './compartido/api';

declare global {
  interface Window {
    /** La API que expone el preload (ver src/preload/preload.ts). */
    canchas: ApiCanchas;
  }
}
