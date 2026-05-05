import { describe, expect, it } from 'vitest';
import { applyDiscountsForCredor, CompanyResolver, DiscountHistoryEntry, EmissaoPorEmpresa } from './processing.worker';

describe('applyDiscountsForCredor', () => {
  it('aplica desconto apenas sobre emissao por empresa e preserva saldo futuro', () => {
    const emissaoPorEmpresa: EmissaoPorEmpresa = {
      'EMPRESA A': 1000,
      'EMPRESA B': 500,
    };

    const descontosPlanilha = {
      'EMPRESA A': 300,
      'EMPRESA B': 600,
    };

    const historico: Map<string, DiscountHistoryEntry> = new Map([
      ['credor-1::empresa a', { valor: 100, origem: 'carryover', timestamp: '2026-04-15T00:00:00Z' }],
    ]);

    const result = applyDiscountsForCredor({
      credorSlug: 'credor-1',
      emissaoPorEmpresa,
      descontosPlanilha,
      historico,
    });

    expect(result.emissaoAjustada['EMPRESA A']).toBe(600);
    expect(result.emissaoAjustada['EMPRESA B']).toBe(0);
    expect(result.ledger).toHaveLength(2);

    const empresaA = result.ledger.find((entry) => entry.empresa === 'EMPRESA A');
    expect(empresaA).toBeDefined();
    expect(empresaA?.descontoAtual).toBe(300);
    expect(empresaA?.carryoverAnterior).toBe(100);
    expect(empresaA?.aplicadoNoPgc).toBe(400);
    expect(empresaA?.saldoProximoPgc).toBe(0);

    const empresaB = result.ledger.find((entry) => entry.empresa === 'EMPRESA B');
    expect(empresaB).toBeDefined();
    expect(empresaB?.descontoAtual).toBe(600);
    expect(empresaB?.carryoverAnterior).toBe(0);
    expect(empresaB?.aplicadoNoPgc).toBe(500);
    expect(empresaB?.saldoProximoPgc).toBe(100);

    expect(Object.keys(result.historicoAtualizado)).not.toContain('credor-1::EMPRESA A');
    expect(Object.keys(result.historicoAtualizado)).toContain('credor-1::empresa b');
  });

  it('não distribui desconto entre empresas se uma empresa não tiver emissao', () => {
    const emissaoPorEmpresa: EmissaoPorEmpresa = {
      'EMPRESA A': 0,
    };

    const descontosPlanilha = {
      'EMPRESA A': 200,
      'EMPRESA B': 100,
    };

    const historico: Map<string, DiscountHistoryEntry> = new Map();
    const result = applyDiscountsForCredor({
      credorSlug: 'credor-2',
      emissaoPorEmpresa,
      descontosPlanilha,
      historico,
    });

    expect(result.emissaoAjustada['EMPRESA A']).toBe(0);
    expect(result.emissaoAjustada['EMPRESA B']).toBe(0);

    const empresaA = result.ledger.find((entry) => entry.empresa === 'EMPRESA A');
    expect(empresaA?.aplicadoNoPgc).toBe(0);
    expect(empresaA?.saldoProximoPgc).toBe(200);

    const empresaB = result.ledger.find((entry) => entry.empresa === 'EMPRESA B');
    expect(empresaB?.aplicadoNoPgc).toBe(0);
    expect(empresaB?.saldoProximoPgc).toBe(100);
  });

  it('aplica valor de desconto agregado para a mesma empresa', () => {
    const emissaoPorEmpresa: EmissaoPorEmpresa = {
      'EMPRESA C': 400,
    };

    const descontosPlanilha = {
      'EMPRESA C': 350,
    };

    const historico: Map<string, DiscountHistoryEntry> = new Map();
    const result = applyDiscountsForCredor({
      credorSlug: 'credor-3',
      emissaoPorEmpresa,
      descontosPlanilha,
      historico,
    });

    expect(result.ledger).toHaveLength(1);
    expect(result.ledger[0].descontoAtual).toBe(350);
    expect(result.ledger[0].aplicadoNoPgc).toBe(350);
    expect(result.ledger[0].saldoProximoPgc).toBe(0);
  });
});

describe('CompanyResolver', () => {
  const stubLogger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    flush: async () => {},
  };

  it('resolves a known manual correction entry', () => {
    const companyMap = new Map([
      [
        'BANCO X',
        {
          fullName: 'BANCO X LTDA',
          cnpj: '12.345.678/0001-90',
          source: 'manual',
          resolved: true,
          raw: 'BANCO X',
        },
      ],
    ] as const,
    );

    const resolver = new CompanyResolver('classic', companyMap, false, stubLogger as any);
    const identity = resolver.resolve('Banco X');

    expect(identity.fullName).toBe('BANCO X LTDA');
    expect(identity.cnpj).toBe('12.345.678/0001-90');
    expect(identity.resolved).toBe(true);
  });

  it('falls back to raw company name when strict validation is disabled', () => {
    let warningCount = 0;
    const logger = {
      ...stubLogger,
      warn: () => {
        warningCount += 1;
      },
    };

    const resolver = new CompanyResolver('classic', new Map(), false, logger as any);
    const identity = resolver.resolve('Empresa Desconhecida');

    expect(identity.fullName).toBe('Empresa Desconhecida');
    expect(identity.cnpj).toBe('');
    expect(identity.resolved).toBe(false);
    expect(warningCount).toBeGreaterThan(0);
  });

  it('throws COMPANY_VALIDATION_ERROR when strict validation is enabled for unknown companies', () => {
    const resolver = new CompanyResolver('classic', new Map(), true, stubLogger as any);

    expect(() => resolver.resolve('Empresa Desconhecida')).toThrow('COMPANY_VALIDATION_ERROR');
  });
});
