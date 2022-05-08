import './App.css'
import init, * as wasm from './../wasm/pkg';

function App() {
  const wasmAlert = async () => {
    await init();
    wasm.greet()
  }

  return (
    <div className="App">
      <button type="button" onClick={wasmAlert}>Hello Wasm!</button>
    </div>
  )
}

export default App
