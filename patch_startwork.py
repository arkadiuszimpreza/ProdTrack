import re

with open('src/components/production/OperatorPanel.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

correct_code = """  const handleStartWork = async (order: ProductionOrder, element?: OrderElement) => {
    if (isProcessingRef.current) return;
    
    if (order.elements && order.elements.length > 0 && !element) {
      setSelectingElementOrder(order);
      return;
    }

    isProcessingRef.current = true;
    setIsProcessing(true);
    try {
      await onStartWork(order, element);
      if (selectingElementOrder) setSelectingElementOrder(null);
    } finally {
      isProcessingRef.current = false;
      setIsProcessing(false);
    }
  };"""

content = re.sub(
    r'  const handleStartWork = async \(order: ProductionOrder, element\?: OrderElement\) => \{.*?  \};',
    correct_code,
    content,
    flags=re.DOTALL
)

with open('src/components/production/OperatorPanel.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
