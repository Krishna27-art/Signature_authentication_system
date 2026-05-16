import { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';

const SignatureCanvas = forwardRef(({ onStrokeChange }, ref) => {
  const canvasRef = useRef(null);
  const isDrawing = useRef(false);
  const strokes = useRef([]);
  const livePoints = useRef([]);
  const [strokeCount, setStrokeCount] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.lineWidth = 2.8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1a1a2e';
  }, []);

  useImperativeHandle(ref, () => ({
    clear: () => {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      strokes.current = [];
      livePoints.current = [];
      setStrokeCount(0);
      if (onStrokeChange) onStrokeChange(0);
    },
    getRawPoints: () => {
      const all = [...strokes.current];
      if (livePoints.current.length > 0) all.push([...livePoints.current]);
      if (!all.length) return [];
      
      const merged = [];
      all.forEach((st, si) => {
        st.forEach((p, pi) => {
          const prevStroke = all[si - 1];
          if (pi === 0 && prevStroke?.length) {
            const gap = p.t - prevStroke[prevStroke.length - 1].t;
            merged.push({ ...p, _strokeGap: gap });
            return;
          }
          merged.push({ ...p });
        });
      });
      return merged;
    },
    getCanvas: () => canvasRef.current,
    getStrokes: () => {
      const all = [...strokes.current];
      if (livePoints.current.length > 0) all.push([...livePoints.current]);
      return all.map((stroke) => stroke.map((p) => ({ ...p })));
    },
  }));

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const src = e.touches ? e.touches[0] : e;
    return {
      x: (src.clientX - rect.left) * scaleX,
      y: (src.clientY - rect.top) * scaleY,
      p: e.pressure || (e.touches ? 0.5 : 0.5),
      t: Date.now(),
      tx: e.tiltX || 0,
      ty: e.tiltY || 0,
    };
  };

  const startDrawing = (e) => {
    e.preventDefault();
    isDrawing.current = true;
    const pos = getPos(e);
    livePoints.current = [pos];
    
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setStrokeCount(strokes.current.length + 1);
    if (onStrokeChange) onStrokeChange(strokes.current.length + 1);
  };

  const draw = (e) => {
    if (!isDrawing.current) return;
    e.preventDefault();
    const pos = getPos(e);
    const prev = livePoints.current[livePoints.current.length - 1];
    livePoints.current.push(pos);
    
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    if (livePoints.current.length > 0) {
      strokes.current.push([...livePoints.current]);
      setStrokeCount(strokes.current.length);
      if (onStrokeChange) onStrokeChange(strokes.current.length);
    }
    livePoints.current = [];
  };

  return (
    <div className="canvas-wrapper">
      <canvas
        ref={canvasRef}
        width={330}
        height={330}
        onPointerDown={startDrawing}
        onPointerMove={draw}
        onPointerUp={stopDrawing}
        onPointerLeave={stopDrawing}
        style={{ touchAction: 'none', width: '100%', height: 'auto' }}
      />
      {strokeCount === 0 && !isDrawing.current && <div className="canvas-hint">✍ Draw here</div>}
    </div>
  );
});

export default SignatureCanvas;
