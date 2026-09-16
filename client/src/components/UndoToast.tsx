import { useEffect, useState } from 'react';
import { Undo2 } from 'lucide-react';

interface UndoToastProps {
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
  duration?: number;
}

export default function UndoToast({ message, onUndo, onDismiss, duration = 5000 }: UndoToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => { setVisible(false); onDismiss(); }, duration);
    return () => clearTimeout(timer);
  }, [duration, onDismiss]);

  if (!visible) return null;

  return (
    <div className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-[70] bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-slide-up">
      <span className="text-sm">{message}</span>
      <button onClick={() => { setVisible(false); onUndo(); }} className="flex items-center gap-1 text-primary-400 dark:text-primary-600 font-medium text-sm hover:underline">
        <Undo2 className="w-4 h-4" /> Undo
      </button>
    </div>
  );
}
