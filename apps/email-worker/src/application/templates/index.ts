import type { EmailTemplate } from '@sop/contracts';

/**
 * Renderiza o template de e-mail para o par (template, variables).
 *
 * Retorna subject e HTML prontos para envio.
 * Variáveis desconhecidas são ignoradas; ausentes ficam como "{{key}}".
 */
export function renderTemplate(
  template: EmailTemplate,
  variables: Record<string, string>,
): { subject: string; html: string } {
  switch (template) {
    case 'FORECAST_READY':
      return forecastReady(variables);
    case 'PHASE_ADVANCED':
      return phaseAdvanced(variables);
    case 'COLLABORATION_OPENED':
      return collaborationOpened(variables);
  }
}

function interpolate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

function wrap(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><title>${title}</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
${body}
</body>
</html>`;
}

function forecastReady(vars: Record<string, string>) {
  const subject = interpolate(
    'Previsão pronta para aprovação — {{scenarioName}}',
    vars,
  );
  const html = wrap(subject, `
    <h2>Previsão disponível para aprovação</h2>
    <p>O cálculo do cenário <strong>${interpolate('{{scenarioName}}', vars)}</strong>
    foi concluído e está aguardando sua aprovação.</p>
    <p>Acesse o sistema para revisar e aprovar a previsão.</p>
  `);
  return { subject, html };
}

function phaseAdvanced(vars: Record<string, string>) {
  const subject = interpolate(
    'Fase avançada — {{scenarioName}}',
    vars,
  );
  const html = wrap(subject, `
    <h2>Fase do ciclo avançou</h2>
    <p>O cenário <strong>${interpolate('{{scenarioName}}', vars)}</strong>
    avançou para a fase <strong>${interpolate('{{phase}}', vars)}</strong>.</p>
    <p>Acesse o sistema para acompanhar o progresso.</p>
  `);
  return { subject, html };
}

function collaborationOpened(vars: Record<string, string>) {
  const subject = interpolate(
    'Colaboração aberta — {{scenarioName}}',
    vars,
  );
  const html = wrap(subject, `
    <h2>Colaboração aberta para o seu cenário</h2>
    <p>A fase de colaboração do cenário <strong>${interpolate('{{scenarioName}}', vars)}</strong>
    foi iniciada. É hora de revisar e ajustar os itens de previsão.</p>
    <p>Acesse o sistema para começar a colaborar.</p>
  `);
  return { subject, html };
}
