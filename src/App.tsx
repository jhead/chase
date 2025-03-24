import { useState } from "react";
import "./App.css";

import { ChaserVideoGrid } from "./components/ChaserVideoGrid";
import { ChaserMap } from "./components/ChaserMap";
import { AppContext, DefaultAppContext } from "./ctx/AppContext";
import { WithChasers } from "./ctx/ChasersContext";
import { Chaser } from "./services/chasers";

import { ResizablePane, ResizablePanes } from "./components/ResizablePanes";
import { Radar } from "./components/Radar/Radar";
import { RadarSite } from "./components/ChaserMap";

const disableMap = window.location.search.indexOf("nomap") >= 0;
console.log(window.location.search, disableMap);

function App() {
  const [appContext, setContext] = useState<AppContext>(DefaultAppContext);
  const [selectedRadar, setSelectedRadar] = useState<RadarSite | null>(null);
  const width = disableMap ? 100 : 65;

  const setChaser = (chaser: Chaser | null) => {
    setContext({
      ...appContext,
      activeChaser: chaser?.properties?.id,
    });
  };

  if (window.location.search.indexOf("radar") >= 0) {
    return (
      <>
        <Radar radarSite={selectedRadar} />
      </>
    );
  }

  return (
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
              <Radar radarSite={selectedRadar} />
            </ResizablePane.Right>
          ) : null}
        </ResizablePanes>
      </WithChasers>
    </AppContext.Provider>
  );
}

export default App;
