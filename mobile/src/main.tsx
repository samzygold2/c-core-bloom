import React from "react";
import { createRoot } from "react-dom/client";
import App from "../../src/App";
import "../../src/index.css";
import "./styles/mobile.css";
import { initMobileShell } from "./native";
import "./perf/deviceProfile";

initMobileShell();

const root = document.getElementById("root");
if (!root) throw new Error("Mobile app root is missing");
createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
