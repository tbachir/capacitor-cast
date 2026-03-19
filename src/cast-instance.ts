import { registerPlugin } from '@capacitor/core';

import type { CastPlugin } from './definitions';

export const Cast = registerPlugin<CastPlugin>('Cast', {
  web: () => import('./web').then((m) => new m.CastWeb()),
});
