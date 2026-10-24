import { useState, useEffect, useRef, useCallback } from "react";
import { Clock } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface TestTimerProps {
  durationMinutes: number;
  onTimeUp: () => void;
  startTime?: number;
}

/**
 * Mobile-safe TestTimer override:
 * Uses absolute wall-clock timestamps (Date.now()) to calculate remaining time
 * rather than naive interval decrements, preventing timer drift or cheating
 * when the app is backgrounded, paused, or suspended by the OS.
 */
export const TestTimer = ({ durationMinutes, onTimeUp, startTime }: TestTimerProps) => {
  const initialStartTimeRef = useRef<number>(startTime || Date.now());
  const onTimeUpRef = useRef(onTimeUp);
  const expiredRef = useRef(false);
  onTimeUpRef.current = onTimeUp;

  const totalAllowedSeconds = durationMinutes * 60;

  const computeRemaining = useCallback(() => {
    const elapsedSeconds = Math.floor((Date.now() - initialStartTimeRef.current) / 1000);
    const remaining = totalAllowedSeconds - elapsedSeconds;
    return Math.max(0, remaining);
  }, [totalAllowedSeconds]);

  const [timeLeft, setTimeLeft] = useState(computeRemaining);
  const [isActive, setIsActive] = useState(true);
  const [showWarning, setShowWarning] = useState(false);

  useEffect(() => {
    if (startTime) {
      initialStartTimeRef.current = startTime;
      setTimeLeft(computeRemaining());
    }
  }, [startTime, computeRemaining]);

  useEffect(() => {
    if (!isActive) return;

    const syncTime = () => {
      const remaining = computeRemaining();
      setTimeLeft(remaining);

      if (remaining <= 300 && remaining > 0) {
        setShowWarning(true);
      }

      if (remaining <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        setIsActive(false);
        onTimeUpRef.current();
      }
    };

    // Immediate sync
    syncTime();

    // Regular interval
    const interval = setInterval(syncTime, 1000);

    // Sync immediately on app foreground / visibility restore
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        syncTime();
      }
    };

    const handleFocus = () => {
      syncTime();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [isActive, computeRemaining]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const isLowTime = timeLeft <= 300;

  return (
    <div className="space-y-2">
      <div
        className={`flex items-center gap-2 rounded-lg border p-3 ${
          isLowTime ? "border-destructive bg-destructive/10" : "border-border bg-card"
        }`}
      >
        <Clock className={`h-5 w-5 ${isLowTime ? "text-destructive" : "text-muted-foreground"}`} />
        <span
          className={`text-lg font-mono font-semibold ${
            isLowTime ? "text-destructive" : "text-foreground"
          }`}
        >
          {formatTime(timeLeft)}
        </span>
      </div>

      {showWarning && isLowTime && (
        <Alert variant="destructive">
          <AlertDescription>5 minutes remaining!</AlertDescription>
        </Alert>
      )}
    </div>
  );
};

export default TestTimer;
