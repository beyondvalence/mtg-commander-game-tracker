import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '../lib/auth';
import { getUserPods, type Pod } from '../lib/podRecords';

const STORAGE_KEY = 'mtg_active_pod_id';

type PodContextValue = {
  pods: Pod[];
  activePod: Pod | null;
  activePodId: string | null;
  isPodAdmin: boolean;
  isLoading: boolean;
  setActivePodId: (podId: string) => void;
  refreshPods: () => Promise<void>;
};

const PodContext = createContext<PodContextValue | null>(null);

export function PodProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [pods, setPods] = useState<Pod[]>([]);
  const [activePodId, setActivePodIdState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadPods = useCallback(async () => {
    if (!user) {
      setPods([]);
      setActivePodIdState(null);
      setIsLoading(false);
      return;
    }

    try {
      const fetched = await getUserPods();
      setPods(fetched);

      const saved = localStorage.getItem(STORAGE_KEY);
      const match = fetched.find((p) => p.podId === saved);

      if (match) {
        setActivePodIdState(match.podId);
      } else if (fetched.length > 0) {
        setActivePodIdState(fetched[0].podId);
        localStorage.setItem(STORAGE_KEY, fetched[0].podId);
      } else {
        setActivePodIdState(null);
      }
    } catch {
      setPods([]);
      setActivePodIdState(null);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    setIsLoading(true);
    loadPods();
  }, [loadPods]);

  const setActivePodId = useCallback((podId: string) => {
    setActivePodIdState(podId);
    localStorage.setItem(STORAGE_KEY, podId);
  }, []);

  const value = useMemo<PodContextValue>(() => {
    const activePod = pods.find((p) => p.podId === activePodId) ?? null;
    return {
      pods,
      activePod,
      activePodId,
      isPodAdmin: activePod?.role === 'admin',
      isLoading,
      setActivePodId,
      refreshPods: loadPods,
    };
  }, [pods, activePodId, isLoading, setActivePodId, loadPods]);

  return <PodContext.Provider value={value}>{children}</PodContext.Provider>;
}

export function usePod() {
  const context = useContext(PodContext);
  if (!context) {
    throw new Error('usePod must be used inside PodProvider');
  }
  return context;
}
