import { WebPlugin } from '@capacitor/core';

import type { CastPlugin } from './definitions';

export class CastWeb extends WebPlugin implements CastPlugin {
  async echo(options: { value: string }): Promise<{ value: string }> {
    console.log('ECHO', options);
    return options;
  }
}
