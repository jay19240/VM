import { defineConfig } from 'vite';
import FullReload from 'vite-plugin-full-reload';
import path from 'path';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig(({ mode }) => {
  if (mode == 'development') {
    return {
      server: {
        allowedHosts: [
          'legacy-engine.io'
        ]
      },
      plugins: [
        FullReload(['public/**'])
      ],
      resolve: {
        alias: {
          '@lib': path.resolve(__dirname, './src/lib')
        }
      },
      build: {
        target: 'esnext',
        rollupOptions: {
          treeshake: false,
        }
      }
    }
  }

  if (mode == 'demo') {
    return {
      plugins: [
        FullReload(['public/**'])
      ],
      resolve: {
        alias: {
          '@lib': path.resolve(__dirname, './src/lib')
        }
      },
      build: {
        minify: true,
        target: 'esnext',
        rollupOptions: {
          treeshake: false,
          input: 'examples.html',
          output: {
            inlineDynamicImports: true
          }
        }
      }
    }
  }

  if (mode == 'game') {
    return {
      plugins: [
        FullReload(['public/**'])
      ],
      resolve: {
        alias: {
          '@lib': path.resolve(__dirname, './src/lib')
        }
      },
      build: {
        minify: true,
        target: 'esnext',
        rollupOptions: {
          treeshake: false,
          input: 'game.html',
          output: {
            inlineDynamicImports: true
          }
        }
      }
    }
  }

  return {
    server: {
      allowedHosts: [
        'legacy-engine.io'
      ]
    },
    publicDir: false,
    plugins: [
      wasm(),
      topLevelAwait(),
      viteStaticCopy({
        targets: [
          { src: 'public/textures/*', dest: 'textures' },
          { src: 'public/styles/*', dest: 'styles' },
        ]
      })
    ],
    build: {
      minify: true,
      lib: {
        entry: path.resolve(__dirname, 'src/lib/legacy.ts'),
        name: 'Legacy',
        fileName: 'index',
        formats: ['es'],
      },
      target: 'esnext',
      rollupOptions: {
        treeshake: false,
        output: {
          inlineDynamicImports: true
        }
      }
    }
  }
});