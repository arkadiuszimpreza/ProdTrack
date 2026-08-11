import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { BoardDrawing, BoardDrawingElement } from '../../types';
import { FlipVertical, FlipHorizontal, RotateCw, ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface Props {
  selectedElementIds?: string[];
  drawing: BoardDrawing;
  onElementClick: (element: BoardDrawingElement) => void;
  completedOperations?: Record<string, string[]>;
}

export function BoardDrawingViewer({ drawing, onElementClick, selectedElementIds = [], completedOperations = {} }: Props) {
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
  const [zoom, setZoom] = useState(1);
  const [baseScale, setBaseScale] = useState(1);

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

  const renderPage = async (num: number, pdf: any = pdfDoc, currentZoom: number = zoom) => {
    if (!pdf || !canvasRef.current || !containerRef.current) return;
    
    try {
      const page = await pdf.getPage(num);
      
      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = containerRef.current.clientHeight;
      const unscaledViewport = page.getViewport({ scale: 1.0 });
      let calculatedBaseScale = baseScale;
      
      // Calculate base scale only once per page load to fit screen
      if (currentZoom === 1) {
        calculatedBaseScale = Math.min(
          (containerWidth - 32) / unscaledViewport.width,
          (containerHeight - 32) / unscaledViewport.height
        );
        if (calculatedBaseScale <= 0) calculatedBaseScale = 1;
        setBaseScale(calculatedBaseScale);
      }
      
      const scale = calculatedBaseScale * currentZoom;
      
      const vp = page.getViewport({ scale });
      setViewport(vp);

      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (!context) return;
      
      // Handle high DPI displays for sharper text
      const outputScale = (window.devicePixelRatio || 1) * 4; // Zwiększona rozdzielczość dla ostrego przybliżenia
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

    useEffect(() => {
    if (pdfDoc) {
      renderPage(currentPage, pdfDoc, zoom);
    }
  }, [zoom]);

  const changePage = (offset: number) => {
    const newPage = currentPage + offset;
    if (newPage > 0 && newPage <= pageCount) {
      setZoom(1);
      renderPage(newPage, pdfDoc, 1);
    }
  };

  // Helper to map pdf coordinates to canvas coordinates
  const getCanvasCoords = (x: number, y: number) => {
    if (!viewport) return { cx: 0, cy: 0 };
    const pts = viewport.convertToViewportPoint(x, y);
    return { cx: pts[0], cy: pts[1] };
  };


  const getPieChartStyle = (element: BoardDrawingElement, completedOps: string[] = []) => {
    const isMultiPanel = (element.locksLength || 0) > 0;
    const totalOps = isMultiPanel ? 5 : 4;
    const opNames = isMultiPanel 
      ? ['Wycinanie tab WS', 'Wklejanie zamków', 'Wklejanie profila tablicy WS', 'Oklejanie tab WS', 'Oprawanie tablic']
      : ['Wycinanie tab WS', 'Wklejanie profila tablicy WS', 'Oklejanie tab WS', 'Oprawanie tablic'];
    
    const step = 100 / totalOps;
    let gradient = 'conic-gradient(';
    
    opNames.forEach((opName, index) => {
      const isCompleted = completedOps.includes(opName);
      // We will use semi-transparent background to let the canvas show through?
      // Actually, since it's a marker, we can use a solid color but we can add a border to separate slices.
      // A conic-gradient doesn't support borders between slices easily, but we can fake it with transparent gaps if we want.
      // Let's use simple colors.
      const color = isCompleted ? '#10b981' : 'rgba(255,255,255,0.8)';
      const start = index * step;
      const end = (index + 1) * step;
      // Add a tiny gap by adjusting percentages? No, let's keep it simple.
      gradient += `${color} ${start}%, ${color} ${end}%`;
      if (index < opNames.length - 1) gradient += ', ';
    });
    gradient += ')';
    
    return { background: gradient };
  };

  // Build the CSS transform for the container
  const transformStyle = `rotate(${rotation}deg) scale(${flipX ? -1 : 1}, ${flipY ? -1 : 1})`;

  return (
    <div className="relative border border-stone-200 rounded-2xl overflow-hidden bg-stone-100 p-0 sm:p-4 h-full flex flex-col min-h-0">
      {/* Controls */}
      <div className="hidden sm:flex flex-wrap justify-between items-center mb-4 gap-4 px-4 sm:px-0 pt-4 sm:pt-0">
        <h3 className="font-bold text-stone-800">Podgląd Rysunku</h3>
        
        <div className="flex items-center gap-2">
          {/* Zoom Controls handled inside TransformWrapper or omitted from top bar */}
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
      
      <div ref={containerRef} className="relative w-full flex-1 flex justify-center items-center bg-stone-200/50 sm:shadow-inner sm:border border-stone-200 sm:rounded-lg overflow-hidden min-h-0">
        <TransformWrapper
          initialScale={1}
          minScale={0.5}
          maxScale={5}
          centerOnInit={true}
          wheel={{ step: 0.1 }}
          pinch={{ step: 5 }}
        >
          {({ zoomIn, zoomOut, resetTransform }) => (
            <>
              {/* Floating controls for mobile & desktop inside the viewer */}
              <div className="absolute top-4 left-4 z-20 flex flex-col sm:flex-row gap-1 bg-white/90 backdrop-blur-sm p-1 border border-stone-200 rounded-lg shadow-sm">
                <button onClick={() => zoomOut()} className="p-2 rounded-md text-stone-500 hover:bg-stone-100"><ZoomOut size={20}/></button>
                <button onClick={() => zoomIn()} className="p-2 rounded-md text-stone-500 hover:bg-stone-100"><ZoomIn size={20}/></button>
                <button onClick={() => resetTransform()} className="p-2 rounded-md text-stone-500 hover:bg-stone-100 sm:border-l border-stone-200 sm:ml-1 sm:pl-2"><Maximize size={20}/></button>
              </div>
              
              {/* Floating tools for mobile (flip, rotate, pages) */}
              <div className="absolute top-4 right-4 z-20 flex sm:hidden flex-col gap-2">
                 <div className="flex flex-col gap-1 bg-white/90 backdrop-blur-sm p-1 border border-stone-200 rounded-lg shadow-sm">
                    <button onClick={() => setFlipY(!flipY)} className={`p-2 rounded-md transition-colors ${flipY ? 'bg-emerald-100 text-emerald-700' : 'text-stone-500'}`}><FlipVertical size={20} /></button>
                    <button onClick={() => setFlipX(!flipX)} className={`p-2 rounded-md transition-colors ${flipX ? 'bg-emerald-100 text-emerald-700' : 'text-stone-500'}`}><FlipHorizontal size={20} /></button>
                    <button onClick={() => setRotation((r) => (r + 90) % 360)} className="p-2 rounded-md text-stone-500"><RotateCw size={20} /></button>
                 </div>
                 <div className="flex flex-col gap-1 items-center bg-white/90 backdrop-blur-sm p-1 border border-stone-200 rounded-lg shadow-sm">
                    <button disabled={currentPage <= 1} onClick={() => changePage(-1)} className="p-2 text-stone-500 disabled:opacity-50 font-bold">&lt;</button>
                    <span className="text-xs font-semibold text-stone-700">{currentPage}/{pageCount}</span>
                    <button disabled={currentPage >= pageCount} onClick={() => changePage(1)} className="p-2 text-stone-500 disabled:opacity-50 font-bold">&gt;</button>
                 </div>
              </div>

              <TransformComponent wrapperStyle={{width: "100%", height: "100%"}}>
                <div 
                  className="relative origin-center transition-transform duration-300" 
                  style={{ 
                    transform: transformStyle,
                    width: viewport ? `${viewport.width}px` : 'auto',
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
                        className={`absolute transform -translate-x-1/2 -translate-y-1/2 w-10 h-10 md:w-12 md:h-12 rounded-full border-2 flex items-center justify-center transition-all shadow-lg group cursor-pointer z-10 ${selectedElementIds.includes(element.id) ? 'border-emerald-600 scale-110 shadow-emerald-500/50 ring-4 ring-emerald-300' : 'border-stone-400 hover:scale-105'}`}
                        style={{ 
                          left: `${leftPercent}%`, 
                          top: `${topPercent}%`,
                          ...getPieChartStyle(element, completedOperations[element.id] || [])
                        }}
                      >
                        <div className="w-1/2 h-1/2 bg-white rounded-full absolute shadow-inner" />
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
              </TransformComponent>
            </>
          )}
        </TransformWrapper>
      </div>    </div>
  );
}
