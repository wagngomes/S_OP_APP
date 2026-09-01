# Contracts — SOP_APP

**Feature**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md) | **Date**: 2026-08-31

Três contratos, uma fonte. Os schemas Zod em `packages/contracts` são normativos; a OpenAPI e os
modelos Pydantic derivam deles ou são verificados contra eles.

| Documento | Escopo |
|-----------|--------|
| [http-api-v1.md](./http-api-v1.md) | Superfície HTTP `/api/v1` consumida pelo frontend |
| [messaging.md](./messaging.md) | Filas, envelope e payloads entre API, workers e motor |
| [decimal-codec.md](./decimal-codec.md) | Como grandeza numérica atravessa qualquer fronteira |

## Regras que valem para os três

1. **Nenhum ponto flutuante em grandeza sensível.** Quantidade, previsão e métrica trafegam
   como string decimal. `z.number()` é proibido para esses campos e a proibição é verificada por
   teste (Princípio V, FR-101, FR-102).
2. **`correlationId` é obrigatório** em toda requisição e em toda mensagem, desde a v1
   (Princípio IX).
3. **Versionamento**: mudança incompatível cria `/api/v2` e `sop.*.v2`, mantendo a v1 ativa
   durante a transição. Nunca se altera o significado de um campo existente.
4. **Testes de contrato dos dois lados** sobre os vetores de
   `packages/contracts/src/golden/`, executados por Vitest e por pytest. Uma divergência de
   interpretação quebra as duas suítes (Princípio III, Princípio VIII).

## Estratégia de evolução para `/api/v2`

- Rotas registradas por plugin de versão; `v1` e `v2` coexistem no mesmo processo.
- Campo novo opcional é mudança compatível e entra na v1.
- Campo removido, renomeado ou com semântica alterada exige v2.
- A v1 permanece por, no mínimo, um ciclo de S&OP completo após a publicação da v2.
