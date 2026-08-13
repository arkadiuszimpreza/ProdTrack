import re

with open('src/components/production/OrderLogsView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    'BarChart2, Users, ChevronDown, ChevronUp, Scale, AlertCircle, Hash, Tablet, PenTool, Layers, TrendingUp, Plus',
    'BarChart2, Users, ChevronDown, ChevronUp, Scale, AlertCircle, Hash, Tablet, PenTool, Layers, TrendingUp, Plus, RefreshCw'
)

content = content.replace(
    'Timestamp, doc, runTransaction, serverTimestamp, or, getDocFromServer } from \'firebase/firestore\';',
    'Timestamp, doc, runTransaction, serverTimestamp, or, getDocFromServer, updateDoc } from \'firebase/firestore\';'
)

with open('src/components/production/OrderLogsView.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
