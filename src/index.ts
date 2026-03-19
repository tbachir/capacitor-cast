import { registerPlugin } from '@capacitor/core';

import type { CastPlugin } from './definitions';

const Cast = registerPlugin<CastPlugin>('Cast', {
  web: () => import('./web').then((m) => new m.CastWeb()),
});

export * from './definitions';
export { Cast };
