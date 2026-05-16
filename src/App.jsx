import { useState, useEffect, useRef } from 'react';
import { BDB, readState, enrollSample, verifySample, getDeviceHash } from './lib/biometrics';
import { loadImageModel } from './lib/image_model';
import { loadModel } from './lib/behavioral_model';
import SignatureCanvas from './components/SignatureCanvas';

function App() {
  const [appState, setAppState] = useState(null);
  const [partials, setPartials] = useState([]);
  const [screen, setScreen] = useState('welcome');
  const [status, setStatus] = useState({ msg: '✏️ Sign on the canvas', type: 'info' });
  const [modelsReady, setModelsReady] = useState(false);
  
  const sigCanvasRef = useRef(null);

  useEffect(() => {
    const init = async () => {
      try {
        const state = await readState();
        setAppState(state);
        
        const p = await BDB.get('partials', []);
        setPartials(p);

        await getDeviceHash();

        // Pre-load BOTH models on app boot for instant verification
        console.log("🚀 Preloading AI Models...");
        const modelLoads = [
          loadImageModel().catch(e => console.warn("Image model failed to load:", e)),
          loadModel().catch(e => console.warn("Behavioral model failed to load:", e))
        ];
        await Promise.all(modelLoads);
        setModelsReady(true);
        console.log("✅ Model loading phase complete.");

      } catch (err) {
        console.error("Initialization failed:", err);
        setStatus({ msg: `❌ ${err.message}`, type: 'error' });
      }
    };
    init();
  }, []);

  const handleAction = async () => {
    if (!sigCanvasRef.current) return;
    
    const raw = sigCanvasRef.current.getRawPoints();
    if (raw.length < 20) {
      setStatus({ msg: '✍️ Draw your signature first', type: 'warn' });
      return;
    }

    try {
      const isEnrolled = !!appState.template;
      
      if (!isEnrolled) {
        // ENROLL
        const canvas = sigCanvasRef.current.getCanvas();
        const strokes = sigCanvasRef.current.getStrokes();
        const result = await enrollSample(raw, appState, partials, canvas, strokes);
        if (result.err) {
          setStatus({ msg: `❌ ${result.err}`, type: 'error' });
          return;
        }
        
        if (result.done) {
          const newState = await readState();
          setAppState(newState);
          setPartials([]);
          setStatus({ msg: '✅ Enrollment Complete!', type: 'ok' });
          setScreen('welcome');
        } else {
          // Store the normalized points returned from BDB
          const p = await BDB.get('partials', []);
          setPartials(p);
          setStatus({ msg: `Sample ${result.progress}/5 saved. Keep signing!`, type: 'info' });
          sigCanvasRef.current.clear();
        }
      } else {
        // VERIFY
        const canvas = sigCanvasRef.current.getCanvas();
        const strokes = sigCanvasRef.current.getStrokes();
        const result = await verifySample(raw, appState, canvas, strokes);
        if (result.err) {
          setStatus({ msg: `❌ ${result.err}`, type: 'error' });
          sigCanvasRef.current.clear();
          return;
        }
        const newState = await readState();
        setAppState(newState);

        if (result.pass) {
          setStatus({ msg: `🔓 Verified! (Confidence: ${Math.round(result.score)}%)`, type: 'ok' });
          sigCanvasRef.current.clear();
        } else {
          setStatus({ msg: `❌ ${result.fail} (Confidence: ${Math.round(result.score)}%)`, type: 'error' });
          sigCanvasRef.current.clear();
        }
      }
    } catch (e) {
      console.error("🛑 App Error:", e);
      setStatus({ msg: `❌ ${e.message || 'Error processing signature'}`, type: 'error' });
    }
  };

  const resetAll = async () => {
    if (!window.confirm('🚨 This will permanently delete ALL signature data. Continue?')) return;
    
    try {
      localStorage.removeItem('p2_salt');
      localStorage.removeItem('authenticated');
      const req = indexedDB.deleteDatabase("BiometricP2");
      const reload = () => window.location.reload();
      req.onsuccess = reload;
      req.onerror = reload;
      req.onblocked = reload;
      setTimeout(reload, 1000);
    } catch {
      window.location.reload();
    }
  };

  if (!appState) return <div className="loading-screen">⚡ Preparing Secure Environment...</div>;

  const isEnrolled = !!appState.template;

  return (
    <div className="phone">
      <div className="status-bar">
        <span>9:41</span>
        <div className="notch"></div>
        <div className="icons">
          <i className="fa-solid fa-signal"></i>
          <i className="fa-solid fa-wifi"></i>
          <i className="fa-solid fa-battery-full"></i>
        </div>
      </div>

      <div className="app-container">
        <div className="screen-stack">
          <div className={`screen ${screen === 'welcome' ? '' : 'hidden'}`}>
            <div className="header">
              <h1>{isEnrolled ? 'BioP2 Auth' : 'Enrollment'}</h1>
              <div className="icon-btn" onClick={() => setScreen('profile')}>
                <i className="fa-solid fa-user"></i>
              </div>
            </div>

            <div className="status-pill info">
              {isEnrolled ? 'Verify identity to continue' : `Step ${partials.length + 1} of 5`}
            </div>

            <div className="canvas-wrapper">
              <SignatureCanvas ref={sigCanvasRef} />
              {partials.length === 0 && !isEnrolled && (
                <div className="canvas-hint">Draw your signature here</div>
              )}
            </div>

            <div className={`status-pill ${status.type}`}>
              {status.msg}
            </div>

            <div className="model-status-bar">
               <span title="Image model status">📸 Image: {modelsReady ? '✅ Ready' : '⏳ Loading'}</span>
               <span title="Neural network status">🧠 Behavior: {appState.behavioralTrained ? '✅ Trained' : '⏳ Pending'}</span>
            </div>

            <div className="btn-row">
              <button className="btn btn-primary" onClick={handleAction}>
                <span>{isEnrolled ? '🔓' : '💾'}</span>
                {isEnrolled ? 'Verify' : 'Save'}
              </button>
              <button className="btn btn-secondary" onClick={() => sigCanvasRef.current.clear()}>
                Clear
              </button>
            </div>

            <div style={{ marginTop: '15px' }}>
               <button className="btn btn-danger" style={{ fontSize: '11px', padding: '10px', opacity: 0.6 }} onClick={resetAll}>
                  Reset Security Data
               </button>
            </div>
          </div>

          <div className={`screen profile-view ${screen === 'profile' ? '' : 'hidden'}`}>
            <div className="profile-header">
              <div className="back-btn" onClick={() => setScreen('welcome')}>
                <i className="fa-solid fa-chevron-left"></i>
              </div>
              <h1>Diagnostics</h1>
            </div>

            <div className="stat-grid">
              <div className="stat-card">
                <div className="stat-label">Samples</div>
                <div className="stat-value">{appState.anchorSamples.length}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Points</div>
                <div className="stat-value">32</div>
              </div>
            </div>

            <div className="section-title">Security Status</div>
            <div className="stat-card">
               <div className="stat-label">Current Threshold</div>
               <div className="stat-value">{Math.round(appState.fusedThreshold || 75)}%</div>
            </div>

            <div className="section-title">Actions</div>
            <button className="btn btn-danger" onClick={resetAll}>
              Full System Reset
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
