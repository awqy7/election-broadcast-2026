import React from "react";
import { createRoot } from "react-dom/client";
import { Overlay } from "./overlay";
import { Studio } from "./studio";
import "./style.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {location.pathname.startsWith("/overlay/") ? <Overlay /> : <Studio />}
  </React.StrictMode>,
);
