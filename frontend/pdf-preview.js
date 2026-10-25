// Canvas rendering only: PDF scripts, forms and external links are not executed.
import { getDocument, GlobalWorkerOptions } from './vendor/pdfjs/pdf.min.mjs';
GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;

export function createPdfPreview(blob, host, isCurrent, onError) {
  let disposed = false, loading, pdf, rendering, pageNumber = 1, busy = false;
  const make = tag => host.ownerDocument.createElement(tag);
  const wrapper = make('div'), controls = make('div'), canvas = make('canvas');
  wrapper.className = 'pdf-viewer'; controls.className = 'pdf-controls'; canvas.className = 'pdf-canvas';
  const previous = make('button'), next = make('button'), label = make('span');
  previous.type = next.type = 'button'; previous.className = next.className = 'button button-quiet';
  previous.textContent = '← Trang trước'; next.textContent = 'Trang sau →';
  label.setAttribute('aria-live', 'polite'); canvas.setAttribute('role', 'img');
  controls.append(previous, label, next); wrapper.append(controls, canvas); host.replaceChildren(wrapper);
  const active = () => !disposed && isCurrent();
  const fail = () => { if (active()) onError(new Error('Không dựng được PDF này. Bạn có thể tải xuống để xem.')); };
  const buttons = () => { previous.disabled = busy || !pdf || pageNumber <= 1; next.disabled = busy || !pdf || pageNumber >= pdf.numPages; };
  async function render() {
    busy = true; buttons();
    try {
      const page = await pdf.getPage(pageNumber);
      if (!active()) return;
      const base = page.getViewport({ scale: 1 });
      if (!(base.width > 0 && base.height > 0 && Number.isFinite(base.width + base.height))) throw new Error('Invalid viewport');
      const viewport = page.getViewport({ scale: Math.min(Math.max(180, host.clientWidth - 24) / base.width, 650 / base.height, 2) });
      const density = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(viewport.width * density)); canvas.height = Math.max(1, Math.floor(viewport.height * density));
      canvas.style.width = Math.floor(viewport.width) + 'px'; canvas.style.height = Math.floor(viewport.height) + 'px';
      canvas.setAttribute('aria-label', 'Trang ' + pageNumber + ' trong ' + pdf.numPages); label.textContent = 'Trang ' + pageNumber + ' / ' + pdf.numPages;
      rendering = page.render({ canvasContext: canvas.getContext('2d'), viewport, transform: density === 1 ? null : [density, 0, 0, density, 0, 0] });
      await rendering.promise;
      if (active()) canvas.dataset.rendered = 'true';
    } catch (error) { if (active() && error?.name !== 'RenderingCancelledException') fail(); }
    finally { rendering = null; busy = false; if (active()) buttons(); }
  }
  previous.addEventListener('click', () => { if (active() && !busy && pageNumber > 1) { pageNumber--; void render(); } });
  next.addEventListener('click', () => { if (active() && !busy && pageNumber < pdf.numPages) { pageNumber++; void render(); } });
  buttons();
  void (async () => {
    try {
      const bytes = new Uint8Array(await blob.arrayBuffer()); if (!active()) return;
      const assets = new URL('./vendor/pdfjs/', import.meta.url);
      loading = getDocument({ data: bytes, isEvalSupported: false, stopAtErrors: true,
        cMapUrl: new URL('cmaps/', assets).href, cMapPacked: true,
        standardFontDataUrl: new URL('standard_fonts/', assets).href, wasmUrl: new URL('wasm/', assets).href });
      pdf = await loading.promise;
      if (!active()) { await pdf.destroy(); return; }
      await render();
    } catch { fail(); }
  })();
  return () => { disposed = true; rendering?.cancel(); if (loading) void loading.destroy().catch(() => {}); canvas.width = canvas.height = 0; };
}
