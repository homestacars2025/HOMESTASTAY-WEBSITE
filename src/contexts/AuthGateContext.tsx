'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { AuthModal } from '@/components/auth/AuthModal';

export interface PendingAction {
  type: 'save' | 'reserve';
  unitId: string;
}

interface AuthGateContextValue {
  openAuthGate: (action: PendingAction) => void;
}

const AuthGateContext = createContext<AuthGateContextValue>({ openAuthGate: () => {} });

export function useAuthGate() {
  return useContext(AuthGateContext);
}

export function AuthGateProvider({ children }: { children: ReactNode }) {
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const openAuthGate = useCallback((action: PendingAction) => {
    setPendingAction(action);
  }, []);

  function close() {
    setPendingAction(null);
  }

  return (
    <AuthGateContext.Provider value={{ openAuthGate }}>
      {children}
      {pendingAction && <AuthModal pendingAction={pendingAction} onClose={close} />}
    </AuthGateContext.Provider>
  );
}
