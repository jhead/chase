import { WasmProvider } from "./ctx/WasmContext";
import { NexradPage } from "./components/NexradPage";
import "./App.css";

/** Canvas element that Bevy attaches to. Always in the DOM for the lifetime of the page. */
function PersistentCanvas() {
  const style: React.CSSProperties = {
    position: "fixed", inset: 0, zIndex: 0, width: "100%", height: "100%", touchAction: "none",
  };
  return <canvas id="radish-bevy-canvas" style={style} onContextMenu={(e) => e.preventDefault()} />;
}

function App() {
  return (
    <WasmProvider>
      <PersistentCanvas />
      <NexradPage />
    </WasmProvider>
  );
}

export default App;
