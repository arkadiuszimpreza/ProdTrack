import React, { useEffect, useState } from 'react';
import { Delete, ArrowBigUp, Check, Keyboard as KeyboardIcon, Space, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export function VirtualKeyboard() {
  const [activeInput, setActiveInput] = useState<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [isShift, setIsShift] = useState(false);
  const [isSymbol, setIsSymbol] = useState(false);
  
  // Track focused input elements
  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (
        (target.tagName === 'INPUT' && !['password', 'checkbox', 'radio', 'file', 'color', 'range', 'submit', 'button', 'reset', 'hidden'].includes((target as HTMLInputElement).type)) ||
        target.tagName === 'TEXTAREA'
      ) {
        if (target.hasAttribute('data-no-keyboard')) return;
        setActiveInput(target as HTMLInputElement | HTMLTextAreaElement);
      }
    };

    const handleFocusOut = (e: FocusEvent) => {
      // Small delay to allow clicking on keyboard without it hiding instantly
      // if focus moves to the keyboard button
      setTimeout(() => {
        if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
           // We do NOT hide it immediately if the user clicked the keyboard itself.
           // However, if we don't hide it on focus out, how does it hide?
           // The keyboard will have a close button or pressing "Enter"/Check.
        }
      }, 50);
    };

    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);

    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  // Dynamic padding and scrolling
  useEffect(() => {
    let scrollParent: HTMLElement | null = null;
    const paddingVal = '400px';

    if (activeInput) {
      // Znajdź najbliższego rodzica, który ma overflow-y-auto lub overflow-auto
      let parent = activeInput.parentElement;
      while (parent && parent !== document.body) {
        const style = window.getComputedStyle(parent);
        if (style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflow === 'auto' || style.overflow === 'scroll') {
          scrollParent = parent;
          break;
        }
        parent = parent.parentElement;
      }

      if (!scrollParent) {
         scrollParent = document.body;
      }

      // Zapisz oryginalny padding by go przywrócić
      const originalPadding = scrollParent.style.paddingBottom;
      scrollParent.style.paddingBottom = `calc(${originalPadding || '0px'} + ${paddingVal})`;

      // Scroll into view
      const timeoutId = setTimeout(() => {
        activeInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 150);

      return () => {
        clearTimeout(timeoutId);
        if (scrollParent) {
           scrollParent.style.paddingBottom = originalPadding;
        }
      };
    }
  }, [activeInput]);

  const handleClose = () => {
    setActiveInput(null);
  };

  const insertText = (char: string) => {
    if (!activeInput) return;
    
    // Focus the input just in case it lost focus
    activeInput.focus();

    // Przetwarzanie przecinka dla type="number" (rozwiązanie błędu czyszczenia pola)
    // Pola type="number" wewnętrznie używają '.' jako separatora dziesiętnego
    let charToInsert = char;
    if (activeInput.type === 'number' && charToInsert === ',') {
      charToInsert = '.';
    }

    let start = 0;
    let end = 0;
    try {
      if (activeInput.type === 'number') {
        start = activeInput.value.length;
        end = activeInput.value.length;
      } else {
        start = activeInput.selectionStart || 0;
        end = activeInput.selectionEnd || 0;
      }
    } catch {
      start = activeInput.value.length;
      end = activeInput.value.length;
    }

    const oldVal = activeInput.value;
    
    // First try execCommand which natively handles type="number" edge cases like "1."
    // and correctly fires events.
    activeInput.focus();
    let execSuccess = false;
    try {
      execSuccess = document.execCommand('insertText', false, charToInsert);
    } catch (e) {
      execSuccess = false;
    }

    if (!execSuccess) {
      // Fallback to manual value manipulation if execCommand is blocked/unsupported
      const newVal = oldVal.substring(0, start) + charToInsert + oldVal.substring(end);
      
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
      
      if (activeInput.tagName === 'INPUT' && nativeInputValueSetter) {
          nativeInputValueSetter.call(activeInput, newVal);
      } else if (activeInput.tagName === 'TEXTAREA' && nativeTextAreaValueSetter) {
          nativeTextAreaValueSetter.call(activeInput, newVal);
      } else {
          activeInput.value = newVal;
      }

      try {
        if (activeInput.type !== 'number') {
          activeInput.setSelectionRange(start + charToInsert.length, start + charToInsert.length);
        }
      } catch {}
      activeInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };

  const handleBackspace = () => {
    if (!activeInput) return;
    activeInput.focus();

    let start = 0;
    let end = 0;
    try {
      if (activeInput.type === 'number') {
        start = activeInput.value.length;
        end = activeInput.value.length;
      } else {
        start = activeInput.selectionStart || 0;
        end = activeInput.selectionEnd || 0;
      }
    } catch {
      start = activeInput.value.length;
      end = activeInput.value.length;
    }

    if (start === 0 && end === 0) return;
    
    let execSuccess = false;
    try {
      execSuccess = document.execCommand('delete', false);
    } catch (e) {
      execSuccess = false;
    }

    if (!execSuccess) {
      const oldVal = activeInput.value;
      let newVal;
      let newPos;
      if (start === end) {
          newVal = oldVal.substring(0, start - 1) + oldVal.substring(end);
          newPos = start - 1;
      } else {
          newVal = oldVal.substring(0, start) + oldVal.substring(end);
          newPos = start;
      }
      
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
      
      if (activeInput.tagName === 'INPUT' && nativeInputValueSetter) {
          nativeInputValueSetter.call(activeInput, newVal);
      } else if (activeInput.tagName === 'TEXTAREA' && nativeTextAreaValueSetter) {
          nativeTextAreaValueSetter.call(activeInput, newVal);
      } else {
          activeInput.value = newVal;
      }

      try {
        if (activeInput.type !== 'number') {
          activeInput.setSelectionRange(newPos, newPos);
        }
      } catch {}
      activeInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };

  const layouts = {
    default: [
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-'],
      ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
      ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
      ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.']
    ],
    shift: [
      ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '_'],
      ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
      ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
      ['Z', 'X', 'C', 'V', 'B', 'N', 'M', '<', '>']
    ],
    symbol: [
      ['[', ']', '{', '}', '#', '%', '^', '*', '+', '='],
      ['_', '\\', '|', '~', '<', '>', '$', '€', '£', '¥'],
      ['-', '/', ':', ';', '(', ')', '&', '@', '"', "'"],
      ['.', ',', '?', '!', '`', '°']
    ]
  };

  const currentLayout = isSymbol ? layouts.symbol : (isShift ? layouts.shift : layouts.default);

  if (!activeInput) return null;

  const Button = ({ children, onClick, className = "", variant = "default" }: any) => {
    const baseStyle = "flex items-center justify-center font-bold text-lg md:text-xl rounded-2xl md:rounded-3xl shadow-sm transition-all active:scale-95 active:shadow-inner touch-manipulation select-none";
    const variants: Record<string, string> = {
      default: "bg-white text-slate-800 hover:bg-slate-100 border-2 border-slate-200 hover:border-slate-300",
      action: "bg-slate-200 text-slate-800 hover:bg-slate-300 border-2 border-slate-300",
      primary: "bg-blue-600 text-white hover:bg-blue-700 border-2 border-blue-700",
      warning: "bg-amber-100 text-amber-900 border-2 border-amber-300 hover:bg-amber-200"
    };

    return (
      <button 
        onClick={(e) => { e.preventDefault(); onClick(); }}
        onMouseDown={(e) => e.preventDefault()} // Prevent losing focus
        className={`${baseStyle} ${variants[variant]} ${className}`}
      >
        {children}
      </button>
    );
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-[9999] pointer-events-none pb-4 px-4 flex justify-center">
      <AnimatePresence>
        {activeInput && (
          <motion.div
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="w-full max-w-5xl bg-slate-100/90 backdrop-blur-md p-3 md:p-5 rounded-[2rem] md:rounded-[3rem] shadow-2xl border-4 border-white pointer-events-auto"
            style={{ boxShadow: "0 -10px 40px rgba(0, 0, 0, 0.15)" }}
          >
            <div className="flex justify-between items-center mb-3 md:mb-4 px-2">
              <div className="flex items-center gap-2 text-slate-500 font-medium">
                <KeyboardIcon size={20} />
                <span className="text-sm">Klawiatura ekranowa</span>
              </div>
              <button 
                onClick={handleClose}
                className="w-10 h-10 flex items-center justify-center bg-white shadow-sm border border-slate-200 rounded-full text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex flex-col gap-2 md:gap-3">
              {/* Rząd 1 */}
              <div className="flex justify-center gap-1 md:gap-2 h-12 md:h-16">
                {currentLayout[0].map(key => (
                  <Button key={key} onClick={() => insertText(key)} className="w-[8%] min-w-[36px] md:min-w-[48px] text-xl md:text-2xl font-black">{key}</Button>
                ))}
                <Button onClick={handleBackspace} variant="action" className="w-[12%] min-w-[60px]"><Delete size={24} /></Button>
              </div>

              {/* Rząd 2 */}
              <div className="flex justify-center gap-1 md:gap-2 h-12 md:h-16">
                <div className="w-[4%]" />
                {currentLayout[1].map(key => (
                  <Button key={key} onClick={() => insertText(key)} className="w-[8%] min-w-[36px] md:min-w-[48px] text-xl md:text-2xl font-black">{key}</Button>
                ))}
                <div className="w-[4%]" />
              </div>

              {/* Rząd 3 */}
              <div className="flex justify-center gap-1 md:gap-2 h-12 md:h-16">
                <Button onClick={() => {setIsShift(!isShift); setIsSymbol(false);}} variant={isShift ? "primary" : "action"} className="w-[12%] min-w-[60px]">
                  <ArrowBigUp size={24} fill={isShift ? "currentColor" : "none"} />
                </Button>
                {currentLayout[2].map(key => (
                  <Button key={key} onClick={() => insertText(key)} className="w-[8%] min-w-[36px] md:min-w-[48px] text-xl md:text-2xl font-black">{key}</Button>
                ))}
                <div className="w-[12%]" />
              </div>

              {/* Rząd 4 */}
              <div className="flex justify-center gap-1 md:gap-2 h-12 md:h-16">
                <Button onClick={() => setIsSymbol(!isSymbol)} variant={isSymbol ? "primary" : "action"} className="w-[12%] min-w-[60px] text-sm md:text-lg">
                  {isSymbol ? "ABC" : "?123"}
                </Button>
                {currentLayout[3].map(key => (
                  <Button key={key} onClick={() => insertText(key)} className="w-[8%] min-w-[36px] md:min-w-[48px] text-xl md:text-2xl font-black">{key}</Button>
                ))}
                <Button onClick={handleClose} variant="primary" className="w-[16%] min-w-[80px]"><Check size={28} /></Button>
              </div>

              {/* Rząd 5 (Spacja itp) */}
              <div className="flex justify-center gap-1 md:gap-2 h-12 md:h-16 mt-1">
                <div className="w-[15%]" />
                <Button onClick={() => insertText(' ')} className="flex-1 w-[60%]">
                  <div className="w-1/3 h-1 md:h-2 rounded-full border-b-4 md:border-b-8 border-slate-300 opacity-50" />
                </Button>
                <div className="w-[15%]" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
