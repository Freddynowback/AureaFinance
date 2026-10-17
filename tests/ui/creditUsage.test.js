import React from 'react';
import renderer, { act } from 'react-test-renderer';
import CreditUsage from '../../components/CreditUsage';

const base = {
  limit: 100000,
  used: 45000,
  inFavor: 0,
  available: 55000,
  overLimit: false,
  utilization: 45,
  financed: 0,
  financedTotal: 0,
  monthlyDue: 0,
  plansCount: 0,
  plansWithoutMonthly: 0,
  revolving: 45000,
  unreconciled: 0,
};

function textOf(tree) {
  function collect(node) {
    if (node === null || node === undefined) return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    return (node.children || []).map(collect).join('');
  }
  return collect(tree.toJSON());
}

function render(element) {
  let tree;
  act(() => {
    tree = renderer.create(element);
  });
  return tree;
}

describe('CreditUsage', () => {
  it('muestra el estado sin límite', () => {
    const tree = render(<CreditUsage summary={{ ...base, limit: null, available: null }} />);
    const text = textOf(tree);
    expect(text).toContain('Sin límite configurado');
    expect(text).toContain('En uso $450.00');
    expect(text).toContain('Configura el límite autorizado');
  });

  it('muestra límite, uso y disponible', () => {
    const tree = render(<CreditUsage summary={base} />);
    const text = textOf(tree);
    expect(text).toContain('Límite autorizado');
    expect(text).toContain('En uso');
    expect(text).toContain('Disponible');
    expect(text).toContain('$550.00');
  });

  it('marca el crédito excedido', () => {
    const tree = render(<CreditUsage summary={{ ...base, used: 120000, available: -20000, overLimit: true, revolving: 120000 }} />);
    const text = textOf(tree);
    expect(text).toContain('Excedido $200.00');
    expect(JSON.stringify(tree.toJSON())).toContain('#DF7D93');
  });

  it('muestra financiación y desglose mensual', () => {
    const tree = render(<CreditUsage summary={{ ...base, used: 60000, available: 40000, financed: 35000, monthlyDue: 5000, plansCount: 2, plansWithoutMonthly: 1, revolving: 25000 }} />);
    const text = textOf(tree);
    expect(text).toContain('Financiado (2 planes)');
    expect(text).toContain('pago mensual que registraste $50.00');
    expect(text).toContain('algún plan sin pago mensual registrado');
    expect(text).toContain('Sin financiar $250.00');
  });

  it('muestra saldo a favor', () => {
    const tree = render(<CreditUsage summary={{ ...base, inFavor: 1250 }} />);
    expect(textOf(tree)).toContain('Saldo a favor $12.50');
  });

  it('muestra el aviso de conciliación', () => {
    const tree = render(<CreditUsage summary={{ ...base, unreconciled: 1000 }} />);
    expect(textOf(tree)).toContain('Tus financiaciones suman más que la deuda registrada');
  });

  it('muestra la versión compacta', () => {
    const tree = render(<CreditUsage summary={base} compact />);
    const text = textOf(tree);
    expect(text).toContain('Disponible $550.00 de $1,000.00 · En uso $450.00');
    expect(text).not.toContain('Límite autorizado');
  });
});
