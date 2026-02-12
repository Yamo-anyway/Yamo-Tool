import React from "react";
import ReactDOM from "react-dom/client";
import Launcher from "./Launcher";
import PM100Discovery from "./PM100Discovery";

import "./styles.css";

function App() {
  const [hash, setHash] = React.useState(window.location.hash || "#/");

  React.useEffect(() => {
    const onHashChange = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  if (hash.startsWith("#/discovery")) return <PM100Discovery />;
  return <Launcher />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
