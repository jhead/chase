import { useState } from "react";
import "./App.css";

import { ChaserVideoGrid } from "./components/ChaserVideoGrid";
import { AppContext, DefaultAppContext } from "./ctx/AppContext";
import { WithChasers } from "./ctx/ChasersContext";
import { WasmProvider } from "./ctx/WasmContext";
import { Chaser } from "./services/chasers";

import { NexradPage } from "./components/NexradPage";

const params = window.location.search;
const isNexrad = params.includes("nexrad") || params.includes("radar");

/** Canvas element that Bevy attaches to. Always in the DOM for the lifetime of the page. */
function PersistentCanvas() {
  const style: React.CSSProperties = isNexrad
    ? { position: "fixed", inset: 0, zIndex: 0, width: "100%", height: "100%", touchAction: "none" }
    : { position: "absolute", width: 0, height: 0, visibility: "hidden" };

  return <canvas id="nexrad-bevy-canvas" style={style} onContextMenu={(e) => e.preventDefault()} />;
}

function App() {
  const [appContext, setContext] = useState<AppContext>(DefaultAppContext);

  const setChaser = (chaser: Chaser | null) => {
    setContext({ ...appContext, activeChaser: chaser?.properties?.id });
  };

  if (isNexrad) {
    return (
      <WasmProvider>
        <PersistentCanvas />
        <NexradPage />
      </WasmProvider>
    );
  }

  return (
    <WasmProvider>
      <PersistentCanvas />
      <AppContext.Provider value={appContext}>
        <WithChasers>
          <ChaserVideoGrid onHover={() => {}} onSelect={setChaser} />
        </WithChasers>
      </AppContext.Provider>
    </WasmProvider>
  );
}

export default App;
