import React, { useEffect, useMemo, useState } from "react";
import Launcher from "./Launcher";
import PM100Discovery from "./PM100Discovery";
import PM100Setup from "./PM100Setup";
import PM100Tool from "./PM100Tool";

export default function App() {
  const [hash, setHash] = useState(window.location.hash || "#/");

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const page = useMemo(() => {
    const raw = (hash || "#/").replace("#", ""); // "/pm100-setup?slot=1"
    const pathOnly = raw.split("?")[0]; // "/pm100-setup"
    if (pathOnly.startsWith("/pm100-discovery")) return "pm100-discovery";
    if (pathOnly.startsWith("/pm100-setup")) return "pm100-setup";
    if (pathOnly.startsWith("/pm100-tool")) return "pm100-tool";

    return "launcher";
  }, [hash]);

  return page === "pm100-tool" ? (
    <PM100Tool />
  ) : page === "pm100-discovery" ? (
    <PM100Discovery />
  ) : page === "pm100-setup" ? (
    <PM100Setup />
  ) : (
    <Launcher />
  );
}
