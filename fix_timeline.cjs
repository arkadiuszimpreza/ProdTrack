const fs = require('fs');

let content = fs.readFileSync('src/components/management/EmployeeTimelineView.tsx', 'utf8');

const oldStr = `{order && onViewOrderLogs && (
                                      <div className="flex gap-2 mt-2">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setExpandedLogId(null);
                                            onViewOrderLogs(order);
                                          }}
                                          className="flex-1 py-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-semibold flex items-center justify-center gap-1 transition-colors"
                                        >
                                          <History size={12} />
                                          Historia zlecenia
                                        </button>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setExpandedLogId(null);
                                            setEditingLog(log);
                                          }}
                                          className="flex-1 py-1.5 px-2 bg-slate-100 hover:bg-emerald-100 text-slate-700 hover:text-emerald-700 rounded text-xs font-semibold flex items-center justify-center gap-1 transition-colors"
                                        >
                                          <Pencil size={12} />
                                          Edytuj meldunek
                                        </button>
                                      </div>
                                    )}`;

const newStr = `                                    <div className="flex gap-2 mt-2">
                                      {order && onViewOrderLogs && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setExpandedLogId(null);
                                            onViewOrderLogs(order);
                                          }}
                                          className="flex-1 py-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-semibold flex items-center justify-center gap-1 transition-colors"
                                        >
                                          <History size={12} />
                                          Historia zlecenia
                                        </button>
                                      )}
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setExpandedLogId(null);
                                          setEditingLog(log);
                                        }}
                                        className="flex-1 py-1.5 px-2 bg-slate-100 hover:bg-emerald-100 text-slate-700 hover:text-emerald-700 rounded text-xs font-semibold flex items-center justify-center gap-1 transition-colors"
                                      >
                                        <Pencil size={12} />
                                        Edytuj meldunek
                                      </button>
                                    </div>`;

content = content.replace(oldStr, newStr);

fs.writeFileSync('src/components/management/EmployeeTimelineView.tsx', content);

