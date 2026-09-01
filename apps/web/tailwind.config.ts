import type { Config } from 'tailwindcss';

/**
 * A paleta é registrada por PAPEL semântico, não por valor literal (D19).
 * Cor nomeada pelo que ela faz sobrevive a uma troca de identidade visual;
 * hex espalhado em classes, não. É o Princípio VII aplicado à camada que mais
 * tende a divergir entre telas.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        turquesa: '#7FD9CD',
        petroleo: '#16455C',
        grafite: '#2B2B2B',
        verde: '#2E9B7C',
        cinza: '#F5F5F5',
        branco: '#FFFFFF',

        // Papéis — use estes nos componentes, não os nomes de cor acima
        header: '#7FD9CD',
        cta: '#7FD9CD',
        titulo: '#16455C',
        'texto-principal': '#16455C',
        'texto-navegacao': '#2B2B2B',
        apoio: '#2E9B7C',
        'fundo-principal': '#FFFFFF',
        'fundo-secundario': '#F5F5F5',
      },
    },
  },
  plugins: [],
};

export default config;
