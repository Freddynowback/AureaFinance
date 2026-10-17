/**
 * Dos proyectos de prueba:
 *  - logic: reglas financieras, servicios y repositorios contra SQLite real
 *    (node:sqlite) en entorno Node, sin mocks de base de datos.
 *  - ui: componentes React Native con el preset oficial.
 */
module.exports = {
  projects: [
    {
      displayName: 'logic',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/unit/**/*.test.js', '<rootDir>/tests/integration/**/*.test.js'],
      transform: { '^.+\\.[jt]sx?$': 'babel-jest' },
    },
    {
      displayName: 'ui',
      preset: '@react-native/jest-preset',
      testMatch: ['<rootDir>/tests/ui/**/*.test.js'],
      setupFiles: ['<rootDir>/tests/ui/setup.js'],
      transformIgnorePatterns: [
        'node_modules/(?!((jest-)?react-native|@react-native|@react-navigation|react-native-.*|@op-engineering)/)',
      ],
    },
  ],
};
