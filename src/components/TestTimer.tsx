import { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface TestTimerProps {
  durationMinutes: number;
  onTimeUp: () => void;
  startTime?: number;
}

export const TestTimer = ({ durationMinutes, onTimeUp, startTime }: TestTimerProps) => {
  const [timeLeft, setTimeLeft] = useState(() => {
    if (startTime) {
      const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
      const remaining = durationMinutes * 60 - elapsedSeconds;
      return Math.max(0, remaining);
    }
    return durationMinutes * 60;
  });
  const [isActive, setIsActive] = useState(true);
  const [showWarning, setShowWarning] = useState(false);

  useEffect(() => {
    if (timeLeft <= 0 && isActive) {
      setIsActive(false);
      onTimeUp();
    }
  }, [timeLeft, isActive, onTimeUp]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    
    if (isActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            setIsActive(false);
            onTimeUp();
            return 0;
          }
          
          if (prev === 300) {
            setShowWarning(true);
          }
          
          return prev - 1;
        });
      }, 1000);
    }

    return () => clearInterval(interval);
  }, [isActive, timeLeft, onTimeUp]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isLowTime = timeLeft <= 300;

  return (
    <div className="space-y-2">
      <div className={`flex items-center gap-2 rounded-lg border p-3 ${
        isLowTime ? 'border-destructive bg-destructive/10' : 'border-border bg-card'
      }`}>
        <Clock className={`h-5 w-5 ${isLowTime ? 'text-destructive' : 'text-muted-foreground'}`} />
        <span className={`text-lg font-mono font-semibold ${
          isLowTime ? 'text-destructive' : 'text-foreground'
        }`}>
          {formatTime(timeLeft)}
        </span>
      </div>
      
      {showWarning && isLowTime && (
        <Alert variant="destructive">
          <AlertDescription>
            5 minutes remaining!
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};