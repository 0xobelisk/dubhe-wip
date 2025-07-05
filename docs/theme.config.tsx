import React from 'react';
import { DocsThemeConfig, useTheme } from 'nextra-theme-docs';
import { useRouter } from 'next/router';
import { useConfig } from 'nextra-theme-docs';

const LogoComponent = () => {
  const { resolvedTheme } = useTheme();

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <img
        src={resolvedTheme === 'dark' ? '/white-dubhe-logo.svg' : '/dubhe-logo.svg'}
        alt="Dubhe Engine Logo"
        style={{ height: '32px', width: 'auto' }}
      />
    </div>
  );
};

const config: DocsThemeConfig = {
  logo: <LogoComponent />,
  project: {
    link: 'https://github.com/0xobelisk/dubhe'
  },
  chat: {
    link: 'https://discord.gg/nveFk3p6za'
  },
  docsRepositoryBase: 'https://github.com/0xobelisk/dubhe/tree/main/docs',
  footer: {
    content: 'Apache 2025 © Obelisk Labs.'
  },
  // banner: {
  //   key: 'v1-0-0-rc1 pre-mainnet released',
  //   content: <a href="https://github.com/0xobelisk/dubhe/releases">🎉 v1.1.1-Mainnet Released →</a>
  // },
  navigation: {
    prev: true,
    next: true
  },
  head() {
    const { asPath, defaultLocale, locale } = useRouter();
    const { frontMatter } = useConfig();
    const url =
      'https://dubhe-docs.obelisk.build' +
      (defaultLocale === locale ? asPath : `/${locale}${asPath}`);

    return (
      <>
        <title>{frontMatter.title ? `${frontMatter.title} - Dubhe Engine` : 'Dubhe Engine'}</title>
        <meta
          name="description"
          content={
            frontMatter.description ||
            'Dubhe Engine - A full-chain game engine based on Move language'
          }
        />
        <link rel="icon" href="/favicon-black.ico" media="(prefers-color-scheme: light)" />
        <link rel="icon" href="/favicon-white.ico" media="(prefers-color-scheme: dark)" />
        <meta property="og:url" content={url} />
        <meta
          property="og:title"
          content={frontMatter.title ? `${frontMatter.title} - Dubhe Engine` : 'Dubhe Engine'}
        />
        <meta
          property="og:description"
          content={
            frontMatter.description ||
            'Dubhe Engine - A full-chain game engine based on Move language'
          }
        />
      </>
    );
  }
};

export default config;
