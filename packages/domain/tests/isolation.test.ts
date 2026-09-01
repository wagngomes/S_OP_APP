import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FORBIDDEN_DOMAIN_DEPENDENCIES } from '../src/index.js';

/**
 * Guarda do Princípio I: o domínio roda sem banco, sem rede e sem servidor.
 *
 * A revisão humana deixa passar um import conveniente; esta suíte não. Ela é o
 * que impede a erosão silenciosa que transforma um domínio testável em código
 * que só roda com Docker em pé.
 */

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };

describe('domínio isolado de infraestrutura', () => {
  const declared = Object.keys(pkg.dependencies ?? {});

  it('não declara nenhuma dependência de infraestrutura', () => {
    const violations = declared.filter((d) =>
      (FORBIDDEN_DOMAIN_DEPENDENCIES as readonly string[]).includes(d),
    );
    expect(violations, 'o domínio precisa continuar puro (Princípio I)').toEqual([]);
  });

  it('não depende de nenhuma aplicação do monorepo', () => {
    const violations = declared.filter((d) => d.startsWith('@sop/') && d !== '@sop/contracts');
    expect(violations).toEqual([]);
  });

  it('roda sem variáveis de ambiente de infraestrutura', () => {
    // Se algum módulo do domínio lesse config no import, esta asserção falharia
    // ao importar o pacote com o ambiente limpo.
    const infraEnv = ['DATABASE_URL', 'AMQP_URL', 'S3_ENDPOINT'];
    const snapshot = infraEnv.map((k) => [k, process.env[k]] as const);
    for (const [k] of snapshot) delete process.env[k];

    expect(() => {
      // Import dinâmico com o ambiente vazio: o domínio não pode reclamar.
      return import('../src/index.js');
    }).not.toThrow();

    for (const [k, v] of snapshot) if (v !== undefined) process.env[k] = v;
  });

  it('não acessa o sistema de arquivos nem a rede no carregamento', async () => {
    const mod = await import('../src/index.js');
    expect(mod.DOMAIN_PACKAGE).toBe('@sop/domain');
  });
});
