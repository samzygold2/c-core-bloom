import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installErrorAlerts } from "./lib/notifySuperAdmin";

if (import.meta.env.PROD) installErrorAlerts();

createRoot(document.getElementById("root")!).render(<App />);
