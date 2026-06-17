import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion } from 'motion/react';
import { BookOpen, FileText } from 'lucide-react';

const DOC_FILES = [
  { id: '1-architektura-app.md', title: 'Architektura Systemu' },
  { id: '2-logika-biznesowa-hooks.md', title: 'Logika i Transakcje' },
  { id: '3-baza-danych-firebase.md', title: 'Struktura Bazy Danych' },
  { id: '4-interfejs-operatora.md', title: 'Interfejs Operatora' },
  { id: '5-komponenty-interfejsu.md', title: 'Komponenty React' }
];

export function DocsView() {
  const [activeDoc, setActiveDoc] = useState(DOC_FILES[0].id);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    // Fetch pobiera fizyczny plik z folderu public/docs/
    fetch(`/docs/${activeDoc}`)
      .then(res => res.text())
      .then(text => {
        setContent(text);
        setLoading(false);
      })
      .catch(err => {
        console.error("Błąd ładowania dokumentacji:", err);
        setContent("Nie udało się załadować dokumentacji. Sprawdź, czy pliki znajdują się w folderze public/docs/.");
        setLoading(false);
      });
  }, [activeDoc]);

  return (
    <div className="flex flex-col md:flex-row gap-6 h-[calc(100vh-8rem)]">
      {/* Pasek nawigacji dokumentacji */}
      <div className="w-full md:w-64 bg-white rounded-2xl shadow-sm border border-stone-100 p-4 flex-shrink-0 overflow-y-auto">
        <div className="flex items-center gap-2 text-stone-800 font-bold mb-4 pb-2 border-b border-stone-100">
          <BookOpen size={20} className="text-emerald-600" />
          <span>Spis Treści</span>
        </div>
        <div className="flex flex-col gap-2">
          {DOC_FILES.map(file => (
            <button
              key={file.id}
              onClick={() => setActiveDoc(file.id)}
              className={`flex items-center gap-2 text-left px-3 py-2 rounded-xl transition-all text-sm font-medium ${
                activeDoc === file.id 
                  ? 'bg-emerald-50 text-emerald-700' 
                  : 'text-stone-500 hover:bg-stone-50 hover:text-stone-700'
              }`}
            >
              <FileText size={16} />
              {file.title}
            </button>
          ))}
        </div>
      </div>

      {/* Główny obszar czytania */}
      <div className="flex-1 bg-white rounded-2xl shadow-sm border border-stone-100 p-8 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full" />
          </div>
        ) : (
          <article className="prose prose-stone prose-emerald max-w-4xl">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content}
            </ReactMarkdown>
          </article>
        )}
      </div>
    </div>
  );
}