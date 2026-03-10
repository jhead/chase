import { useState } from "react";
import "./App.css";

import { ChaserVideoGrid } from "./components/ChaserVideoGrid";
import { ChaserMap } from "./components/ChaserMap";
import { AppContext, DefaultAppContext } from "./ctx/AppContext";
import { WithChasers } from "./ctx/ChasersContext";
import { WasmProvider } from "./ctx/WasmContext";
import { Chaser } from "./services/chasers";

import { ResizablePane, ResizablePanes } from "./components/ResizablePanes";
import { NexradPage } from "./components/NexradPage";
import { RadarSite } from "./components/ChaserMap";

const params = window.location.search;
const isNexrad = params.includes("nexrad");
const isRadar = !isNexrad && params.includes("radar");
const disableMap = !isNexrad && params.includes("nomap");

/** Canvas element that Bevy attaches to. Always in the DOM for the lifetime of the page. */
function PersistentCanvas() {
  const style: React.CSSProperties = isNexrad || isRadar
    ? { position: "fixed", inset: 0, zIndex: 0, width: "100%", height: "100%" }
    : { position: "absolute", width: 0, height: 0, visibility: "hidden" };

  return <canvas id="nexrad-bevy-canvas" style={style} />;
}

function App() {
  const [appContext, setContext] = useState<AppContext>(DefaultAppContext);
  const [selectedRadar, setSelectedRadar] = useState<RadarSite | null>(null);
  const width = disableMap ? 100 : 65;

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

  if (isRadar) {
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
          <ResizablePanes initialWidth={width}>
            <ResizablePane.Left>
              <ChaserVideoGrid onHover={() => {}} onSelect={setChaser} />
            </ResizablePane.Left>
            {!disableMap ? (
              <ResizablePane.Right>
                <ChaserMap
                  selectedRadar={selectedRadar}
                  onRadarSelect={setSelectedRadar}
                />

              </ResizablePane.Right>
            ) : null}
          </ResizablePanes>
        </WithChasers>
      </AppContext.Provider>
    </WasmProvider>
  );
}

export default App;
