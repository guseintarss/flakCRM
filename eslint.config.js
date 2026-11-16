import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'data', 'node_modules'] },
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    ...js.configs.recommended,
  },
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      // Локальное UI-состояние (активный пункт поиска, закрытие меню) синхронизируется
      // с debounced-запросом и навигацией через эффекты — это осознанный паттерн.
      'react-hooks/set-state-in-effect': 'off',
      // Хуки и константы осознанно живут рядом с компонентами; HMR не критичен.
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['server/**/*.ts', 'shared/**/*.ts', 'vite.config.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // TypeScript уже проверяет неопределённые идентификаторы.
      'no-undef': 'off',
      // any встречается в тестовых хелперах и разборе SQLite-строк.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
);
