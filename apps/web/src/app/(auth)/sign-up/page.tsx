'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signUp } from '../../../lib/api';

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signUp({ name, email, password });
      router.push('/scenarios');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar conta');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h2 className="mb-4 text-xl font-semibold text-titulo">Criar conta</h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-texto-principal" htmlFor="name">
            Nome
          </label>
          <input
            id="name"
            type="text"
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-cinza px-3 py-2 text-texto-principal outline-none focus:border-petroleo"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-texto-principal" htmlFor="email">
            E-mail
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded border border-cinza px-3 py-2 text-texto-principal outline-none focus:border-petroleo"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-texto-principal" htmlFor="password">
            Senha <span className="text-xs text-texto-principal/60">(mínimo 8 caracteres)</span>
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded border border-cinza px-3 py-2 text-texto-principal outline-none focus:border-petroleo"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-turquesa px-4 py-2 font-semibold text-petroleo transition hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Criando…' : 'Criar conta'}
        </button>
        <p className="text-center text-sm text-texto-principal">
          Já tem conta?{' '}
          <a href="/sign-in" className="text-apoio underline">
            Entrar
          </a>
        </p>
      </form>
    </>
  );
}
