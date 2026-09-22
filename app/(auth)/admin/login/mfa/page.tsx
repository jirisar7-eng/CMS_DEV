import Link from "next/link";
import { MfaLoginForm } from "@/components/admin/auth/MfaLoginForm";
import { SynthesisLogo } from "@/components/brand/SynthesisLogo";

export default function MfaLoginPage() {
  return (
    <main className="min-h-screen bg-background text-foreground flex flex-col justify-center px-4 sm:px-6">
      <div className="mx-auto w-full max-w-md">
        <SynthesisLogo variant="primary" decorative={false} />
        <h1 className="mt-6 text-2xl font-bold">Dvoufaktorové ověření</h1>
        <p className="mt-2 text-sm text-muted-foreground">Zadejte kód z ověřovací aplikace nebo jeden ze záložních kódů.</p>
        <div className="mt-8 bg-card p-6 rounded-xl border border-border">
          <MfaLoginForm />
          <Link href="/admin/login" className="mt-6 block text-sm underline">Zpět na přihlášení</Link>
        </div>
      </div>
    </main>
  );
}
