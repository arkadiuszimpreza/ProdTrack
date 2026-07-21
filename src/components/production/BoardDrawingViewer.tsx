import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { BoardDrawing, BoardDrawingElement } from '../../types';
import { FlipVertical, FlipHorizontal, RotateCw } from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface Props {
  drawing: BoardDrawing;
  onElementClick: (element: BoardDrawingElement) => void;
}

export function BoardDrawingViewer({ drawing, onElementClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [viewport, setViewport] = useState<any>(null);
  
  // Transform controls
  const [flipY, setFlipY] = useState(false);
  const [flipX, setFlipX] = useState(false);
  const [rotation, setRotation] = useState(0);

  const renderTaskRef = useRef<any>(null);

  useEffect(() => {
    loadPdf();
    return () => {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
    };
  }, [drawing.fileData]);

  const loadPdf = async () => {
    try {
      const base64Data = drawing.fileData.split(',')[1] || drawing.fileData;
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const loadingTask = pdfjsLib.getDocument({ data: bytes });
      const pdf = await loadingTask.promise;
      setPdfDoc(pdf);
      setPageCount(pdf.numPages);
      renderPage(1, pdf);
    } catch (e) {
      console.error(e);
    }
  };

  const renderPage = async (num: number, pdf: any = pdfDoc) => {
    if (!pdf || !canvasRef.current || !containerRef.current) return;
    
    try {
      const page = await pdf.getPage(num);
      
      // Dopasuj skalę do szerokości kontenera
      const containerWidth = containerRef.current.clientWidth;
      const unscaledViewport = page.getViewport({ scale: 1.0 });
      const scale = containerWidth / unscaledViewport.width;
      
      const vp = page.getViewport({ scale });
      setViewport(vp);

      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (!context) return;
      
      // Handle high DPI displays for sharper text
      const outputScale = window.devicePixelRatio || 1;
      canvas.width = Math.floor(vp.width * outputScale);
      canvas.height = Math.floor(vp.height * outputScale);
      canvas.style.width = Math.floor(vp.width) + "px";
      canvas.style.height = Math.floor(vp.height) + "px";
      
      // Reset transform before scaling, in case it's reused
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.scale(outputScale, outputScale);

      const renderContext = {
        canvasContext: context,
        viewport: vp
      };
      
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (err) {}
      }
      
      const renderTask = page.render(renderContext);
      renderTaskRef.current = renderTask;
      await renderTask.promise;
      renderTaskRef.current = null;
      setCurrentPage(num);
    } catch (e: any) {
      if (e?.name !== 'RenderingCancelledException') {
        console.error('PDF Render Error:', e);
      }
    }
  };

  const changePage = (offset: number) => {
    const newPage = currentPage + offset;
    if (newPage > 0 && newPage <= pageCount) {
      renderPage(newPage);
    }
  };

  // Helper to map pdf coordinates to canvas coordinates
  const getCanvasCoords = (x: number, y: number) => {
    if (!viewport) return { cx: 0, cy: 0 };
    const pts = viewport.convertToViewportPoint(x, y);
    return { cx: pts[0], cy: pts[1] };
  };

  // Build the CSS transform for the container
  const transformStyle = `rotate(${rotation}deg) scale(${flipX ? -1 : 1}, ${flipY ? -1 : 1})`;

  return (
    <div className="relative border border-stone-200 rounded-2xl overflow-hidden bg-stone-100 p-4">
      {/* Controls */}
      <div className="flex flex-wrap justify-between items-center mb-4 gap-4">
        <h3 className="font-bold text-stone-800">Podgląd Rysunku</h3>
        
        <div className="flex items-center gap-2">
          {/* Transform Controls */}
          <div className="flex gap-1 bg-white p-1 border border-stone-200 rounded-lg shadow-sm mr-2">
            <button 
              onClick={() => setFlipY(!flipY)}
              className={`p-2 rounded-md transition-colors ${flipY ? 'bg-emerald-100 text-emerald-700' : 'text-stone-500 hover:bg-stone-100'}`}
              title="Odbicie pionowe"
            >
              <FlipVertical size={18} />
            </button>
            <button 
              onClick={() => setFlipX(!flipX)}
              className={`p-2 rounded-md transition-colors ${flipX ? 'bg-emerald-100 text-emerald-700' : 'text-stone-500 hover:bg-stone-100'}`}
              title="Odbicie poziome"
            >
              <FlipHorizontal size={18} />
            </button>
            <button 
              onClick={() => setRotation((r) => (r + 90) % 360)}
              className="p-2 rounded-md text-stone-500 hover:bg-stone-100 transition-colors"
              title="Obróć o 90 stopni"
            >
              <RotateCw size={18} />
            </button>
          </div>

          {/* Page Controls */}
          <div className="flex gap-2 items-center bg-white px-3 py-1 border border-stone-200 rounded-lg shadow-sm">
            <button 
              disabled={currentPage <= 1} 
              onClick={() => changePage(-1)}
              className="text-stone-500 hover:text-emerald-600 disabled:opacity-50 font-bold px-2"
            >
              &lt;
            </button>
            <span className="text-sm font-semibold text-stone-700 whitespace-nowrap">Strona {currentPage} z {pageCount}</span>
            <button 
              disabled={currentPage >= pageCount} 
              onClick={() => changePage(1)}
              className="text-stone-500 hover:text-emerald-600 disabled:opacity-50 font-bold px-2"
            >
              &gt;
            </button>
          </div>
        </div>
      </div>

      <div ref={containerRef} className="relative w-full flex justify-center bg-stone-200/50 shadow-inner border border-stone-200 rounded-lg overflow-auto p-4 min-h-[400px]">
        {/* Transform Container - applies to BOTH canvas and overlay markers */}
        <div 
          className="relative origin-center transition-transform duration-300" 
          style={{ 
            transform: transformStyle,
            width: viewport ? `${viewport.width}px` : 'auto',
            maxWidth: '100%'
          }}
        >
          <canvas ref={canvasRef} className="block w-full bg-white shadow-md" />
          
          {/* Overlay markers */}
          {viewport && drawing.elements.filter(e => e.page === currentPage).map(element => {
            const { cx, cy } = getCanvasCoords(element.x, element.y);
            const leftPercent = (cx / viewport.width) * 100;
            const topPercent = (cy / viewport.height) * 100;
            
            return (
              <button
                key={element.id}
                onClick={() => onElementClick(element)}
                className="absolute transform -translate-x-1/2 -translate-y-1/2 w-8 h-8 md:w-12 md:h-12 rounded-full border-4 border-emerald-500 bg-emerald-500/20 hover:bg-emerald-500/60 flex items-center justify-center transition-all shadow-lg group cursor-pointer z-10"
                style={{ left: `${leftPercent}%`, top: `${topPercent}%` }}
              >
                {/* 
                  To keep the tooltip readable regardless of canvas flip/rotation, 
                  we reverse the transform on the tooltip 
                */}
                <div 
                  className="hidden group-hover:block absolute top-full mt-2 bg-stone-900 text-white text-sm font-bold px-3 py-1.5 rounded-lg shadow-xl whitespace-nowrap z-20 pointer-events-none"
                  style={{ transform: `scale(${flipX ? -1 : 1}, ${flipY ? -1 : 1}) rotate(${-rotation}deg)` }}
                >
                  {element.name}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
