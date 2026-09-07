import { useEffect, useState } from 'react';

export function useMvtStream() {
  const [logs, setLogs] = useState<string[]>([]);
  const [pendingPasswordPrompt, setPendingPasswordPrompt] = useState<string | null>(null);

  useEffect(() => {
    const unsubLog = window.epoch.onMvtLog?.((data) => {
      setLogs((prev) => [...prev, data.line]);
    });
    const unsubPassword = window.epoch.onMvtPasswordRequired?.((username) => {
      setPendingPasswordPrompt(username);
    });

    return () => {
      unsubLog?.();
      unsubPassword?.();
    };
  }, []);

  const submitPassword = async (password: string) => {
    await window.epoch.submitMvtPassword(password);
    setPendingPasswordPrompt(null);
  };

  return { logs, pendingPasswordPrompt, submitPassword };
}