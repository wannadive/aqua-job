import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Pretendard Variable"', 'Pretendard', 'system-ui', 'sans-serif'],
      },
      colors: {
        // 디자인 B안 토큰 (globals.css 변수)
        bg: 'var(--bg)',
        ink: 'var(--ink)',
        accent: { DEFAULT: 'var(--accent)', foreground: '#FFFFFF' },
        muted: { DEFAULT: 'var(--muted)', foreground: 'var(--muted)' },
        warn: { DEFAULT: 'var(--warn)', bg: 'var(--warn-bg)' },
        ok: { DEFAULT: 'var(--ok)', bg: 'var(--ok-bg)' },
        surface: 'var(--surface)',
        line: 'var(--line)',
        // shadcn/ui 컴포넌트가 쓰는 이름 → B안 토큰으로 연결
        background: 'var(--bg)',
        foreground: 'var(--ink)',
        primary: { DEFAULT: 'var(--ink)', foreground: '#FFFFFF' },
        secondary: { DEFAULT: 'var(--surface)', foreground: 'var(--ink)' },
        destructive: { DEFAULT: 'var(--danger)', foreground: '#FFFFFF' },
        popover: { DEFAULT: '#FFFFFF', foreground: 'var(--ink)' },
        border: 'var(--line)',
        input: 'var(--line)',
        ring: 'var(--accent)',
      },
      borderRadius: {
        card: 'var(--radius-card)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
export default config
