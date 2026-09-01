# Contract — Codec Decimal

**Norma**: `packages/contracts/src/decimal` | **Espelho Python**:
`services/forecast-engine/src/forecast_engine/domain/decimal_codec.py`

Este é o contrato que sustenta o Princípio V da constituição. Se ele quebrar, a precisão exigida
some sem aviso e sem erro.

## Representação

Grandeza sensível trafega como **string decimal**, nunca como número JSON.

```json
{ "quantity": "1234.500000", "metricValue": "0.184300" }
```

| Grandeza | Escala | Arredondamento |
|----------|--------|----------------|
| Quantidade, previsão, número colaborado, consensado, publicado, venda real | 6 | `ROUND_HALF_UP` |
| Percentual e métrica de acuracidade | 6 | `ROUND_HALF_UP` |

## Gramática aceita

```text
DecimalString := '-'? DIGIT+ ('.' DIGIT{1,6})?
```

- Sem notação científica, sem separador de milhar, sem espaços.
- Negativo é válido para quantidade (devolução), inválido para métrica de erro não assinada.
- `NaN`, `Infinity` e string vazia são rejeitados.
- Zero canônico é `"0.000000"`.

## Schema Zod normativo

```ts
export const DecimalString = (scale = 6) =>
  z.string()
   .regex(new RegExp(`^-?\\d+(\\.\\d{1,${scale}})?$`), 'decimal inválido')
   .transform((s) => new Decimal(s).toFixed(scale));
```

`z.number()` para qualquer campo desta lista é violação de contrato e falha o teste de guarda
descrito abaixo.

## Travessias e conversões

| Fronteira | Regra |
|-----------|-------|
| HTTP → API | Zod valida a string; o service converte para `Decimal` (decimal.js) |
| API → Postgres | Prisma `Decimal`; jamais `Number(...)` sobre o valor |
| API → MinIO (Parquet) | coluna de tipo string contendo a string decimal |
| MinIO → motor | `Decimal(str)` na leitura; conversão para `float64` **somente** dentro do domínio do motor |
| Motor → MinIO | `quantize(Decimal('0.000001'), ROUND_HALF_UP)` antes de serializar |
| Motor → RabbitMQ | apenas referência; nenhum valor numérico sensível no envelope |
| API → frontend | string decimal; o Next.js apenas formata para exibição, nunca recalcula |

## Conservação de soma no rateio

FR-046 exige que a soma dos filhos seja exatamente igual ao pai. Quantizar cada filho
isoladamente não garante isso. O algoritmo normativo é **maior resto**:

1. Calcular a parte de cada filho pela representatividade histórica, em `float64`.
2. Quantizar cada parte para baixo na escala 6, guardando o resto fracionário.
3. Calcular a diferença entre o total do pai e a soma das partes quantizadas.
4. Distribuir essa diferença, em unidades da última casa, aos filhos de maior resto, um a um.

Resultado: `sum(children) == parent`, exato, sempre.

## Vetores dourados

`packages/contracts/src/golden/decimal.json` é lido por Vitest e por pytest. Casos mínimos:

| Caso | Entrada | Esperado |
|------|---------|----------|
| Canonicalização | `"1.5"` | `"1.500000"` |
| Meio para cima | `"0.0000005"` | `"0.000001"` |
| Negativo meio para cima | `"-0.0000005"` | `"-0.000001"` |
| Rejeição de científico | `"1e3"` | erro |
| Rejeição de excesso de casas | `"1.1234567"` | erro |
| Rateio conserva | pai `"100.000000"`, pesos `[1/3, 1/3, 1/3]` | filhos somam exatamente `"100.000000"` |
| Rateio com peso zero | pai `"10.000000"`, pesos `[1, 0]` | segundo filho `"0.000000"` |
| Representatividade nula | pai `"10.000000"`, todos os pesos zero | comportamento explícito de FR-047 |

## Testes de guarda obrigatórios

- **Guarda de schema**: varre `packages/contracts` e falha se `z.number()` aparecer em qualquer
  campo da lista de grandezas sensíveis.
- **Guarda de travessia**: teste de integração que envia `"0.000001"` da API ao motor e de volta,
  afirmando igualdade exata da string.
- **Guarda de conservação**: propriedade sobre rateios aleatórios afirmando
  `sum(children) == parent` em 100% dos casos.
