import { createContext, useContext, useEffect, useMemo, useReducer, useCallback } from 'react';
import type { ReactNode } from 'react';
import { reducer } from './reducer';
import { initialState, saveAiSettings } from './state';
import type { AppState, ToastItem } from './state';
import type { Action } from './reducer';

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  toast: (msg: string, kind?: 'ok' | 'err') => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // AI 配置持久化（唯一行为改进，spec §4）
  useEffect(() => { saveAiSettings(state.aiSettings); }, [state.aiSettings]);

  const toast = useCallback((msg: string, kind?: 'ok' | 'err') => {
    const item: ToastItem = { id: Date.now() + Math.random(), msg, kind };
    dispatch({ type: 'TOAST', toast: item });
    setTimeout(() => dispatch({ type: 'DISMISS_TOAST', id: item.id }), 2400);
  }, []);

  const value = useMemo(() => ({ state, dispatch, toast }), [state, toast]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
