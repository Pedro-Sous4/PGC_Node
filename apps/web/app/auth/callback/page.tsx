'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { setAuthToken } from '../../../lib/api';

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const token = searchParams.get('token');
    
    if (token) {
      setAuthToken(token);
      router.push('/');
    } else {
      router.push('/auth/login?error=no_token');
    }
  }, [router, searchParams]);

  return (
    <div style={{ 
      display: 'flex', 
      height: '100vh', 
      width: '100vw', 
      alignItems: 'center', 
      justifyContent: 'center',
      background: 'var(--bg)',
      color: 'var(--foreground)'
    }}>
      <div style={{ textAlign: 'center' }}>
        <div className="spinning" style={{ 
          width: 40, 
          height: 40, 
          border: '3px solid var(--primary)', 
          borderTopColor: 'transparent', 
          borderRadius: '50%',
          margin: '0 auto 16px'
        }} />
        <p style={{ fontWeight: 600 }}>Finalizando autenticação...</p>
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>Aguarde enquanto preparamos seu acesso.</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <AuthCallbackContent />
    </Suspense>
  );
}
