import { useState } from "react";
import "./App.css";

import { ChaserMap } from "./components/ChaserMap";
import { ChaserVideoGrid } from "./components/ChaserVideoGrid";
import { AppContext, DefaultAppContext } from "./ctx/AppContext";
import { WithChasers } from "./ctx/ChasersContext";
import { Chaser } from "./services/chasers";

import { ResizablePane, ResizablePanes } from "./components/ResizablePanes";

const disableMap = window.location.search.indexOf("nomap") >= 0;
console.log(window.location.search, disableMap);

function App() {
  const [appContext, setContext] = useState<AppContext>(DefaultAppContext);
  const width = disableMap ? 100 : 65;

  const setChaser = (chaser: Chaser | null) => {
    setContext({
      ...appContext,
      activeChaser: chaser?.properties?.id,
    });
  };

  return (
    <AppContext.Provider value={appContext}>
      <WithChasers>
        <ResizablePanes initialWidth={width}>
          <ResizablePane.Left>
            <ChaserVideoGrid onHover={() => {}} onSelect={setChaser} />
          </ResizablePane.Left>
          {!disableMap ? (
            <ResizablePane.Right>
              <ChaserMap />
            </ResizablePane.Right>
          ) : null}
        </ResizablePanes>
      </WithChasers>
    </AppContext.Provider>
  );
}

export default App;
