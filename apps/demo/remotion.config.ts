import { Config } from '@remotion/cli/config';

/**
 * Remotion transpiles with esbuild and takes the JSX runtime from tsconfig.json, but
 * under pnpm its bundler cannot resolve TypeScript to read that file, so it falls
 * back to classic `React.createElement`. Set the automatic runtime on the loader
 * directly, for our files and for the shared @excerpt/ui components alike.
 */
Config.overrideWebpackConfig((config) => ({
  ...config,
  module: {
    ...config.module,
    rules: (config.module?.rules ?? []).map((rule) => {
      if (!rule || typeof rule !== 'object' || !Array.isArray(rule.use)) return rule;
      return {
        ...rule,
        use: rule.use.map((use) =>
          use && typeof use === 'object' && typeof use.loader === 'string' && use.loader.includes('esbuild-loader')
            ? { ...use, options: { ...(use.options as object), jsx: 'automatic' } }
            : use),
      };
    }),
  },
}));

Config.setVideoImageFormat('jpeg');
Config.setConcurrency(4);
