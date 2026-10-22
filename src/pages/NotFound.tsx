import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { MapPinOff } from "lucide-react";
import { BackButton } from "@/components/BackButton";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-4">
      <div className="max-w-sm text-center">
        <MapPinOff className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
        <p className="mb-1 text-sm font-semibold text-muted-foreground">404</p>
        <h1 className="mb-2 text-2xl font-bold">There's nothing at this address</h1>
        <p className="mb-6 text-muted-foreground">
          The link may be old or mistyped. Your tests and results are still where you left them.
        </p>
        <BackButton to="/" label="Go to the home page" className="h-11 sm:h-10" />
      </div>
    </div>
  );
};

export default NotFound;
