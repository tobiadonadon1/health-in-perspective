// Runs the real edge function on FN_PORT for local end-to-end tests (Deno.serve normally binds 8000).
(globalThis as any).EdgeRuntime={waitUntil(p:Promise<unknown>){p.catch(()=>{})}};
const serve=Deno.serve;
(Deno as any).serve=(handler:any)=>serve({port:Number(Deno.env.get('FN_PORT')),hostname:'127.0.0.1',onListen(){console.log('fn ready')}},handler);
await import('../../supabase/functions/health-api/index.ts');
