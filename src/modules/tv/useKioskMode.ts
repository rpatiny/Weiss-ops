import { useCallback, useEffect, useState } from 'react';

/**
 * Modo "TV como vídeo": tela cheia (o navegador exige um clique/tecla — a 1ª interação já entra),
 * cursor escondido quando parado, tela sempre acesa (Wake Lock) e tecla F para alternar.
 */
export function useKioskMode() {
  const [fullscreen, setFullscreen] = useState(() => !!document.fullscreenElement || matchMedia('(display-mode: fullscreen)').matches);
  const [idle, setIdle] = useState(false);

  const enter = useCallback(() => {
    if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement || matchMedia('(display-mode: fullscreen)').matches);
    document.addEventListener('fullscreenchange', onChange);
    // Qualquer clique/tecla (controle remoto, mouse) entra em tela cheia; F alterna.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') {
        if (document.fullscreenElement) void document.exitFullscreen();
        else enter();
      } else if (e.key !== 'Escape') enter();
    };
    const onClick = () => enter();
    window.addEventListener('keydown', onKey);
    window.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('click', onClick);
    };
  }, [enter]);

  // Cursor some depois de 3 s parado.
  useEffect(() => {
    let timer = setTimeout(() => setIdle(true), 3000);
    const wake = () => {
      setIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), 3000);
    };
    window.addEventListener('mousemove', wake);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousemove', wake);
    };
  }, []);

  // Tela sempre acesa (quando o navegador suporta); readquire ao voltar para a aba.
  useEffect(() => {
    type Sentinel = { release: () => Promise<void> };
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<Sentinel> } };
    let lock: Sentinel | null = null;
    const acquire = () => {
      if (document.visibilityState === 'visible') void nav.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => undefined);
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      document.removeEventListener('visibilitychange', acquire);
      void lock?.release().catch(() => undefined);
    };
  }, []);

  return { fullscreen, idle, enter };
}
