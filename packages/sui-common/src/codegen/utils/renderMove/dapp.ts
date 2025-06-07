import { DubheConfig } from '../../types';

export const defineDapp = (config: DubheConfig) => {
  console.log(config);
  return `
  module ${config.name} {
    public struct ${config.name} {}
  }
  `;
};