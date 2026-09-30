import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Minus, Plus, Maximize2, Scan } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PAGE_W, PAGE_H } from "./document-model";

function PreviewSurface({ children, title, onExpand }: { children: ReactNode; title: string; onExpand?: () => void }) {
  const viewport = useRef<HTMLDivElement>(null), source = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(500), [height, setHeight] = useState(PAGE_H), [pages, setPages] = useState(1);
  const [zoom, setZoom] = useState<number | null>(null);
  const fit = Math.min(1, available / PAGE_W), scale = zoom ?? fit;
  useEffect(() => {
    if (!viewport.current || !source.current) return;
    const observer = new ResizeObserver(() => {
      if (viewport.current) { const style = getComputedStyle(viewport.current); setAvailable(Math.max(120, viewport.current.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight))); }
      if (source.current) { setHeight(source.current.offsetHeight); setPages(Math.max(1, source.current.querySelectorAll(".document-page").length)); }
    });
    observer.observe(viewport.current); observer.observe(source.current); return () => observer.disconnect();
  }, []);
  function changeZoom(delta: number) { setZoom(Math.min(1.5, Math.max(.25, Math.round((scale + delta) * 100) / 100))); }
  return <section className="document-preview" aria-label={title}>
    <div className="document-preview-toolbar no-print"><strong>{title}</strong><div className="document-zoom-controls"><button onClick={() => changeZoom(-.1)} disabled={scale <= .25} aria-label="Réduire le zoom" title="Réduire"><Minus size={17} /></button><span aria-live="polite">{Math.round(scale * 100)} %</span><button onClick={() => changeZoom(.1)} disabled={scale >= 1.5} aria-label="Agrandir le zoom" title="Agrandir"><Plus size={17} /></button><button onClick={() => setZoom(null)} className="fit-document-button" aria-label="Ajuster la page à la largeur" title="Ajuster à la largeur"><Scan size={17} /><span>Ajuster</span></button>{onExpand && <button onClick={onExpand} aria-label="Ouvrir l’aperçu en grand" title="Voir en grand"><Maximize2 size={17} /></button>}</div></div>
    <div ref={viewport} className="document-preview-scroll"><div className="document-preview-frame" style={{ width: PAGE_W * scale, height: height * scale }}><div ref={source} className="document-preview-source" style={{ width: PAGE_W, transform: `scale(${scale})`, transformOrigin: "top left" }}>{children}</div></div></div>
    <div className="document-preview-hint no-print"><span>{pages} page{pages > 1 ? "s" : ""} · format A4</span><span>{zoom && scale > fit ? "Faites défiler pour voir toute la page." : "Le zoom ne change pas le document imprimé."}</span></div>
  </section>;
}
export default function DocumentPreview({ children, title = "Aperçu du document" }: { children: ReactNode; title?: string }) {
  const [expanded, setExpanded] = useState(false);
  return <><PreviewSurface title={title} onExpand={() => setExpanded(true)}>{children}</PreviewSurface><Dialog open={expanded} onOpenChange={setExpanded}><DialogContent className="document-preview-dialog"><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>Utilisez le zoom pour lire le document. La mise en page imprimée reste inchangée.</DialogDescription></DialogHeader><PreviewSurface title="Votre document">{children}</PreviewSurface></DialogContent></Dialog></>;
}
