export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-fundo-secundario p-4">
      <div className="w-full max-w-md rounded-lg bg-fundo-principal p-8 shadow-md">
        <h1 className="mb-6 text-center text-2xl font-bold text-titulo">SOP_APP</h1>
        {children}
      </div>
    </div>
  );
}
