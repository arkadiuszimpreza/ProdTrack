import re

with open('src/components/production/OperatorPanel.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    'const [isProcessing, setIsProcessing] = useState(false);',
    'const [isProcessing, setIsProcessing] = useState(false);\n  const isProcessingRef = React.useRef(false);'
)

def replace_handler(match):
    name = match.group(1)
    args = match.group(2)
    body = match.group(3)
    return f'''const {name} = async ({args}) => {{
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    setIsProcessing(true);
    try {{
{body}
    }} finally {{
      isProcessingRef.current = false;
      setIsProcessing(false);
    }}
  }};'''

content = re.sub(
    r'const (handleStartWork) = async \((.*?)\) => \{\s*if \(isProcessing\) return;\s*([\s\S]*?)\s*\} finally \{\s*setIsProcessing\(false\);\s*\}\s*\};',
    replace_handler,
    content
)

content = re.sub(
    r'const (handleStopWork) = async \((.*?)\) => \{\s*if \(isProcessing\) return;\s*setIsProcessing\(true\);\s*try \{\s*([\s\S]*?)\s*\} finally \{\s*setIsProcessing\(false\);\s*\}\s*\};',
    replace_handler,
    content
)

content = re.sub(
    r'const (handleStartTeamWork) = async \((.*?)\) => \{\s*if \(isProcessing\) return;\s*setIsProcessing\(true\);\s*try \{\s*([\s\S]*?)\s*\} finally \{\s*setIsProcessing\(false\);\s*\}\s*\};',
    replace_handler,
    content
)

content = re.sub(
    r'const (handleJoinTeam) = async \((.*?)\) => \{\s*if \(isProcessing\) return;\s*setIsProcessing\(true\);\s*try \{\s*([\s\S]*?)\s*\} finally \{\s*setIsProcessing\(false\);\s*\}\s*\};',
    replace_handler,
    content
)

with open('src/components/production/OperatorPanel.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
