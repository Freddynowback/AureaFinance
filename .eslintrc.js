module.exports = {
  root: true,
  extends: '@react-native',
  env: { es2020: true },
  rules: {
    // Las funciones de render de React Navigation (tabBarIcon) son el patrón documentado.
    'react/no-unstable-nested-components': ['warn', { allowAsProps: true }],
  },
};
