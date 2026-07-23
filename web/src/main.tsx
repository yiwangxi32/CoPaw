import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./ui/App";
import "./ui/styles.css";

document.documentElement.classList.add("app-booting");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <App />
);

