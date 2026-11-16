/**
 * "Ver deitado" no celular em pé.
 * 1) Android/Chrome: tela cheia + trava de orientação real na horizontal (o layout passa a ser o de tela larga).
 * 2) Onde não dá para travar (iPhone/Safari): a classe `force-landscape` gira o app 90° via CSS (ver index.css),
 *    com o `#root` como área de rolagem. Só vale com o aparelho em pé (`orientation: portrait`).
 */
type LockableOrientation = ScreenOrientation & { lock?: (o: 'landscape') => Promise<void>; unlock?: () => void };

export async function enterLandscape(): Promise<void> {
  document.documentElement.classList.add('force-landscape');
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
    await (screen.orientation as LockableOrientation).lock?.('landscape');
  } catch {
    /* sem suporte (ex.: iPhone): fica a rotação por CSS */
  }
}

export function exitLandscape(): void {
  document.documentElement.classList.remove('force-landscape');
  try {
    (screen.orientation as LockableOrientation).unlock?.();
  } catch {
    /* ignore */
  }
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
}
