/**
 * Domínio da orquestração — regras de S&OP como funções puras.
 *
 * Este pacote NÃO conhece Fastify, Prisma, RabbitMQ, MinIO nem qualquer
 * biblioteca de observabilidade. Essa restrição é o que torna o Princípio I da
 * constituição verificável em vez de aspiracional: se o domínio pudesse importar
 * infraestrutura, testá-lo exigiria subir infraestrutura, e a regra de negócio
 * deixaria de ser testável isoladamente.
 *
 * A guarda automatizada está em packages/domain/tests/isolation.test.ts e em
 * .dependency-cruiser.js.
 */

export const DOMAIN_PACKAGE = '@sop/domain' as const;

/** Dependências que o domínio jamais pode adquirir. */
export const FORBIDDEN_DOMAIN_DEPENDENCIES = [
  'fastify',
  '@fastify/cookie',
  '@fastify/multipart',
  '@prisma/client',
  'prisma',
  'amqplib',
  'pino',
  'prom-client',
  '@aws-sdk/client-s3',
  'resend',
  'next',
  'better-auth',
] as const;

// --- Cenário ----------------------------------------------------------------
export {
  PHASE_ORDER,
  canTransition,
  isActionAllowed,
  nextPhases,
  type Actor,
  type ScenarioAction,
  type ScenarioPhase,
  type TransitionContext,
  type TransitionRefusalCode,
  type TransitionResult,
} from './scenario/phase-machine.js';

export {
  isProrationRequired,
  validateParameters,
  type AccuracyMetric,
  type ModelPackage,
  type ParameterIssue,
  type ParametersContext,
  type ParametersInput,
  type ParametersValidation,
  type SegmentationLevelRef,
} from './scenario/parameters.js';

// --- Ingestão ---------------------------------------------------------------
export {
  SEGMENT_SEPARATOR,
  parseDeclaredLabels,
  parseSegments,
  validateDeclaredLabels,
  validateRowSegments,
  type IssueCode,
  type ValidationIssue,
} from './ingestion/segment-validation.js';

export {
  consolidate,
  type ConsolidationResult,
  type RawSalesRow,
} from './ingestion/deduplicate.js';
