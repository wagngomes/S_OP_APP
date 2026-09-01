/**
 * Guarda automatizada dos Princípios I e IX da constituição.
 *
 * O domínio precisa ser testável sem framework, sem transporte, sem banco e sem
 * infraestrutura de observabilidade. Estas regras falham o build quando alguém
 * atravessa essa fronteira — que é justamente o tipo de erosão que a constituição
 * existe para impedir.
 */
module.exports = {
  forbidden: [
    {
      name: 'dominio-sem-infraestrutura',
      severity: 'error',
      comment:
        'packages/domain não pode depender de framework, transporte, banco ou observabilidade (Princípio I).',
      from: { path: '^packages/domain/src' },
      to: {
        dependencyTypes: ['npm'],
        path: '^(fastify|@fastify|@prisma/client|prisma|amqplib|pino|prom-client|@aws-sdk|resend|next)',
      },
    },
    {
      name: 'dominio-sem-apps',
      severity: 'error',
      comment: 'O domínio não conhece as aplicações que o usam (Princípio I).',
      from: { path: '^packages/domain/src' },
      to: { path: '^(apps|services)/' },
    },
    {
      name: 'contracts-sem-infraestrutura',
      severity: 'error',
      comment: 'packages/contracts define schemas; não carrega adaptadores.',
      from: { path: '^packages/contracts/src' },
      to: {
        dependencyTypes: ['npm'],
        path: '^(fastify|@fastify|@prisma/client|amqplib|pino|prom-client|@aws-sdk|resend)',
      },
    },
    {
      name: 'sem-dependencia-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.base.json' },
  },
};
