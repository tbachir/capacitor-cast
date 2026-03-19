export interface CastPlugin {
  echo(options: { value: string }): Promise<{ value: string }>;
}
