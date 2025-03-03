import "./App.css";
import { useMcpServer } from "./hooks/useMcpServer";

function App() {
  const { status } = useMcpServer("ws://localhost:4000?channel=browser");

  return (
    <div className="App">
      <h1>WebSocket Client</h1>
      <div className="connection-status">
        <p className={status}>{status}</p>
      </div>
    </div>
  );
}

export default App;
