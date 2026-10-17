jest.mock('react-native-reanimated', () => {
  try {
    return require('react-native-reanimated/mock');
  } catch (error) {
    const { View } = require('react-native');
    const Animated = {
      View,
      createAnimatedComponent: Component => Component,
    };
    return {
      __esModule: true,
      default: Animated,
      Easing: { out: fn => fn, cubic: value => value },
      useAnimatedProps: callback => callback(),
      useAnimatedStyle: callback => callback(),
      useReducedMotion: () => true,
      useSharedValue: value => ({ value }),
      withTiming: value => value,
    };
  }
});

jest.mock('react-native-worklets', () => ({
  __esModule: true,
  makeMutable: value => ({ value }),
  useSharedValue: value => ({ value }),
}));

jest.mock('react-native-svg', () => {
  const React = require('react');
  const { Text, View } = require('react-native');
  const SvgComponent = ({ children, ...props }) => React.createElement(View, props, children);
  const SvgText = ({ children, ...props }) => React.createElement(Text, props, children);
  return {
    __esModule: true,
    default: SvgComponent,
    Svg: SvgComponent,
    Circle: SvgComponent,
    G: SvgComponent,
    Path: SvgComponent,
    Line: SvgComponent,
    Rect: SvgComponent,
    Polygon: SvgComponent,
    Polyline: SvgComponent,
    Defs: SvgComponent,
    Stop: SvgComponent,
    LinearGradient: SvgComponent,
    RadialGradient: SvgComponent,
    SvgXml: SvgComponent,
    Text: SvgText,
  };
});

jest.mock('react-native-safe-area-context', () => {
  try {
    return require('react-native-safe-area-context/jest/mock');
  } catch (error) {
    return {
      SafeAreaProvider: ({ children }) => children,
      SafeAreaView: ({ children }) => children,
      useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
      useSafeAreaFrame: () => ({ x: 0, y: 0, width: 320, height: 640 }),
    };
  }
});

jest.mock('@op-engineering/op-sqlite', () => {
  throw new Error('@op-engineering/op-sqlite must not be loaded by UI tests');
});

jest.mock('react-native-notify-kit', () => ({
  __esModule: true,
  default: jest.fn(),
  notify: jest.fn(),
}));

jest.mock('@sbaiahmed1/react-native-biometrics', () => ({
  __esModule: true,
  default: jest.fn(),
  ReactNativeBiometrics: jest.fn(),
}));
