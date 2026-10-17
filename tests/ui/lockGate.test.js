import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { AppState } from 'react-native';
import LockGate from '../../components/LockGate';
import { authenticate } from '../../services/security/biometricService';
import { useSettings } from '../../hooks/useSettings';

jest.mock('../../services/security/biometricService', () => ({
  authenticate: jest.fn(),
}));

jest.mock('../../hooks/useSettings', () => ({
  useSettings: jest.fn(),
}));

const settingsFor = (enabled, graceSeconds = 30) => ({
  'security.biometricEnabled': enabled,
  'security.graceSeconds': graceSeconds,
});

describe('LockGate', () => {
  let changeHandler;
  let remove;

  beforeEach(() => {
    jest.clearAllMocks();
    authenticate.mockResolvedValue({ success: true });
    remove = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((event, handler) => {
      expect(event).toBe('change');
      changeHandler = handler;
      return { remove };
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  async function renderWith(settings) {
    useSettings.mockReturnValue({ settings });
    let renderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <LockGate><>{'CONTENIDO'}</></LockGate>,
      );
      await Promise.resolve();
    });
    return renderer;
  }

  test('bloqueo desactivado muestra children', async () => {
    const renderer = await renderWith(settingsFor(false));
    expect(renderer.toJSON()).toBe('CONTENIDO');
    expect(authenticate).not.toHaveBeenCalled();
  });

  test('activado pide authenticate al montar y muestra bloqueo hasta éxito', async () => {
    let resolveAuthentication;
    authenticate.mockReturnValue(new Promise(resolve => { resolveAuthentication = resolve; }));
    useSettings.mockReturnValue({ settings: settingsFor(true) });
    let renderer;
    await act(async () => {
      renderer = TestRenderer.create(<LockGate><>{'CONTENIDO'}</></LockGate>);
    });

    expect(authenticate).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByProps({ children: 'Desbloquea para ver tus finanzas.' })).toBeTruthy();
    expect(renderer.toJSON()).not.toBe('CONTENIDO');

    await act(async () => {
      resolveAuthentication({ success: true });
      await Promise.resolve();
    });
    expect(renderer.toJSON()).toBe('CONTENIDO');
  });

  test("error 'unavailable' muestra mensaje", async () => {
    authenticate.mockResolvedValue({ success: false, unavailable: true, error: 'sin biometría' });
    const renderer = await renderWith(settingsFor(true));
    expect(renderer.root.findByProps({
      children: 'Este dispositivo no tiene biometría ni bloqueo de pantalla configurado. Desactiva el bloqueo desde Ajustes tras configurarlo en Android.',
    })).toBeTruthy();
  });

  test('al volver de background tras graceSeconds bloquea y vuelve a autenticar', async () => {
    const renderer = await renderWith(settingsFor(true, 30));
    expect(renderer.toJSON()).toBe('CONTENIDO');
    authenticate.mockResolvedValue({ success: true });
    let now = 100000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);

    await act(async () => {
      changeHandler('background');
      now += 31000;
      changeHandler('active');
      await Promise.resolve();
    });

    expect(authenticate).toHaveBeenCalledTimes(2);
    expect(renderer.toJSON()).toBe('CONTENIDO');
  });

  test('al volver antes de graceSeconds no bloquea', async () => {
    const renderer = await renderWith(settingsFor(true, 30));
    authenticate.mockClear();
    let now = 200000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);

    await act(async () => {
      changeHandler('background');
      now += 29000;
      changeHandler('active');
      await Promise.resolve();
    });

    expect(authenticate).not.toHaveBeenCalled();
    expect(renderer.toJSON()).toBe('CONTENIDO');
  });
});
