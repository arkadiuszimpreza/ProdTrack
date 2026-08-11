const fs = require('fs');

let content = fs.readFileSync('src/components/production/OperatorPanelTablice.tsx', 'utf8');

// Replace the main wrapper for selectedDrawing
content = content.replace(
    '<div className="flex flex-col h-full bg-white rounded-3xl p-6 border border-stone-200 shadow-sm">',
    '<div className="fixed inset-0 z-50 lg:static lg:z-auto flex flex-col h-full bg-stone-100 lg:bg-white lg:rounded-3xl p-0 lg:p-6 lg:border border-stone-200 shadow-sm">'
);

// Replace the top bar
content = content.replace(
    '<div className="flex items-center gap-4 mb-6">',
    '<div className="flex items-center gap-4 mb-0 lg:mb-6 bg-white p-4 lg:p-0 border-b border-stone-200 lg:border-none shadow-sm lg:shadow-none z-10">'
);

// We need to move the "Zamelduj wybrane panele" to be a floating bottom button on mobile.
const desktopControls = `<div className="flex justify-between items-center bg-stone-100 p-4 rounded-2xl border border-stone-200">
                <div>
                  <h3 className="font-bold text-stone-800">Zaznaczono paneli: <span className="text-emerald-600 text-xl">{selectedPanelIds.length}</span></h3>
                  <p className="text-xs text-stone-500">Kliknij elementy na rysunku, aby je zaznaczyć, a następnie zamelduj czas.</p>
                </div>
                <button 
                  onClick={handleReportPanels}
                  disabled={selectedPanelIds.length === 0 || reporting}
                  className="px-6 py-3 bg-emerald-600 disabled:bg-stone-300 text-white font-bold rounded-xl shadow-md transition-colors flex items-center gap-2"
                >
                  {reporting ? 'Zapisywanie...' : 'Zamelduj wybrane panele'}
                </button>
              </div>`;

const responsiveControls = `<div className="hidden lg:flex justify-between items-center bg-stone-100 p-4 rounded-2xl border border-stone-200">
                <div>
                  <h3 className="font-bold text-stone-800">Zaznaczono paneli: <span className="text-emerald-600 text-xl">{selectedPanelIds.length}</span></h3>
                  <p className="text-xs text-stone-500">Kliknij elementy na rysunku, aby je zaznaczyć, a następnie zamelduj czas.</p>
                </div>
                <button 
                  onClick={handleReportPanels}
                  disabled={selectedPanelIds.length === 0 || reporting}
                  className="px-6 py-3 bg-emerald-600 disabled:bg-stone-300 text-white font-bold rounded-xl shadow-md transition-colors flex items-center gap-2"
                >
                  {reporting ? 'Zapisywanie...' : 'Zamelduj wybrane panele'}
                </button>
              </div>`;

content = content.replace(desktopControls, responsiveControls);

// Change the flex container gap
content = content.replace(
    '<div className="flex flex-col h-full gap-4">',
    '<div className="flex flex-col h-full gap-0 lg:gap-4 relative">'
);

// Change the view area to take full space on mobile
content = content.replace(
    '<div className="flex-1 flex flex-col min-h-0">',
    '<div className="flex-1 flex flex-col min-h-0 relative">'
);

// Mobile "Pokaż listę" button - make it look better
content = content.replace(
    '<div className="mb-4">',
    '<div className="mb-0 lg:mb-4 hidden lg:block">'
);

// Add the floating mobile button for "Zamelduj panele"
const beforeCloseDiv = `</BoardDrawingViewer>`;
const afterCloseDiv = `</BoardDrawingViewer>
                  
                  {/* Floating Action Button (Mobile) */}
                  <div className="lg:hidden absolute bottom-6 left-0 right-0 flex flex-col items-center gap-3 px-4 z-20 pointer-events-none">
                    {selectedPanelIds.length > 0 && (
                      <div className="bg-stone-900/80 backdrop-blur-sm text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg pointer-events-auto">
                        Zaznaczono: {selectedPanelIds.length}
                      </div>
                    )}
                    <div className="flex w-full gap-2 pointer-events-auto">
                      <button 
                        onClick={() => setShowElementsList(true)}
                        className="flex-1 py-4 bg-white text-stone-700 font-bold rounded-2xl shadow-xl flex items-center justify-center gap-2 border border-stone-200"
                      >
                        <List size={20} /> Lista
                      </button>
                      <button 
                        onClick={handleReportPanels}
                        disabled={selectedPanelIds.length === 0 || reporting}
                        className="flex-[2] py-4 bg-emerald-600 disabled:bg-stone-400 text-white font-bold rounded-2xl shadow-xl flex items-center justify-center gap-2"
                      >
                        {reporting ? 'Zapisywanie...' : 'Zamelduj panele'}
                      </button>
                    </div>
                  </div>`;
content = content.replace(beforeCloseDiv, afterCloseDiv);

// Also we need to make sure the list of elements takes the full screen nicely when toggled.
const listContainerOriginal = `<div className="flex-1 flex flex-col bg-white rounded-2xl border border-stone-200 overflow-hidden">`;
const listContainerResponsive = `<div className="absolute inset-0 z-30 lg:relative lg:inset-auto lg:z-auto flex-1 flex flex-col bg-white lg:rounded-2xl lg:border border-stone-200 overflow-hidden">`;
content = content.replace(listContainerOriginal, listContainerResponsive);

fs.writeFileSync('src/components/production/OperatorPanelTablice.tsx', content);
