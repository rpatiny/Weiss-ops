import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Download, ExternalLink, Printer, QrCode } from 'lucide-react';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/cn';
import { Button } from './Button';

/** Endereço de uma rota do próprio site (ex.: `#/clock`) para o QR code. */
export const siteUrl = (hash: string) => `${window.location.origin}${window.location.pathname}${hash}`;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * QR code de uma rota pública (ponto, pedido do shop floor): mostra, imprime cartaz A4 e baixa PNG.
 */
export function QrPoster({ hash, title, hint, posterTitle, posterText, fileName, openLabel }: {
  hash: string;
  title: string;
  hint: string;
  posterTitle: string;
  posterText: string;
  fileName: string;
  openLabel: string;
}) {
  const { t } = useI18n();
  const [svg, setSvg] = useState('');
  const [png, setPng] = useState('');
  const url = siteUrl(hash);
  useEffect(() => {
    void QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }).then(setSvg);
    void QRCode.toDataURL(url, { margin: 2, width: 1024, errorCorrectionLevel: 'M' }).then(setPng);
  }, [url]);

  const print = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(posterTitle)}</title>
<style>body{font-family:system-ui,sans-serif;text-align:center;padding:40px;color:#0f172a}h1{font-size:40px;margin:0 0 8px}p{font-size:20px;max-width:560px;margin:0 auto 24px}
.qr{width:440px;height:440px;margin:0 auto}.qr svg{width:100%;height:100%}small{display:block;margin-top:16px;color:#475569;font-size:14px;word-break:break-all}</style></head>
<body><h1>${esc(posterTitle)}</h1><p>${esc(posterText)}</p><div class="qr">${svg}</div><small>${esc(url)}</small>
<script>window.onload=()=>{window.print()}</script></body></html>`);
    w.document.close();
  };

  return (
    <div className="card flex flex-col items-center gap-4 p-6 text-center md:flex-row md:items-start md:text-left">
      <div className="size-56 shrink-0 rounded-xl bg-white p-3 shadow-inner [&_svg]:size-full" aria-label={title} role="img" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="min-w-0">
        <h2 className="flex items-center justify-center gap-2 text-lg font-semibold text-slate-900 md:justify-start dark:text-white">
          <QrCode className="size-5" /> {title}
        </h2>
        <p className="mt-1 text-sm text-slate-500">{hint}</p>
        <p className="mt-2 font-mono text-sm break-all text-slate-700 dark:text-slate-200">{url}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2 md:justify-start">
          <Button variant="primary" icon={Printer} onClick={print} disabled={!svg}>
            {t('timesheet.print')}
          </Button>
          <a href={png} download={fileName} className={cn(!png && 'pointer-events-none opacity-50')}>
            <Button icon={Download} tabIndex={-1}>
              {t('timesheet.download')}
            </Button>
          </a>
          <a href={hash} target="_blank" rel="noreferrer">
            <Button icon={ExternalLink} tabIndex={-1}>
              {openLabel}
            </Button>
          </a>
        </div>
      </div>
    </div>
  );
}
