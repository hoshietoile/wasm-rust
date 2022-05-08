import './App.css'
import init, * as wasm from './../wasm/pkg';
import { useCallback, useEffect, useRef, useState } from 'react';

const vertexShaderSource = `
  attribute vec2 a_coords;
  attribute vec3 a_color;
  
  varying vec3 v_color;
  
  uniform float u_pointsize;
  uniform float u_width;
  uniform float u_height;

  void main() {
    float x = -1.0 + 2.0 * (a_coords.x / u_width);
    float y =  1.0 - 2.0 * (a_coords.y / u_height);
    gl_Position = vec4(x, y, 0.0, 1.0);
    v_color = a_color;
    gl_PointSize = u_pointsize; 
  }
`;

const fragmentShaderSource = `
  precision mediump float;
  varying vec3 v_color;
  
  void main() {
    float distanceFromCenter = distance( gl_PointCoord, vec2(0.5, 0.5) );
    if (distanceFromCenter >= 0.5) {
      discard; // don't draw this pixel.
    }
    gl_FragColor = vec4(v_color, 1.0);
  }
`;

function App() {
  const webgl = useRef<WebGLRenderingContext | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const attributeCoords = useRef<number>(0.0);
  const bufferCoords = useRef<WebGLBuffer | null>(null);
  const attributeColor = useRef<number>(0.0);
  const bufferColor = useRef<WebGLBuffer | null>(null);
  const uniformWidth = useRef<WebGLUniformLocation | null>(0.0);
  const uniformHeight = useRef<WebGLUniformLocation | null>(0.0);
  const uniformPointSize = useRef<WebGLUniformLocation | null>(0.0);
  const [animating, setAnimating] = useState<boolean>(true);

  const [pointSize, setPointSize] = useState<number>(20);

  const POINT_COUNT = 500;
  const pointCoords = new Float32Array(2 * POINT_COUNT);
  const pointVelocities = new Float32Array(2 * POINT_COUNT);
  const pointRandomColors = new Float32Array(3 * POINT_COUNT);

  /** Point用のデータ 座標と速度、色を情報として含む */
  const createPointData = useCallback(() => {
    if (!canvasRef.current) throw new Error('create point data error.')
    const canvas = canvasRef.current;
    for (let i = 0; i < POINT_COUNT; i++) {
      const randomVelocity = 1 + 3 * Math.random();
      const randomAngle = 2 * Math.PI * Math.random();
      pointCoords[2 * i] = canvas.width * Math.random();
      pointCoords[2 * i + 1] = canvas.height * Math.random();
      pointVelocities[2 * i] = randomVelocity * Math.cos(randomAngle);
      pointVelocities[2 * i + 1] = randomVelocity * Math.sin(randomAngle);
    }
    for (let i = 0; i < 3 * POINT_COUNT; i++) {
      pointRandomColors[i] = Math.random();
    }
    return {
      pointCoords,
      pointVelocities,
      pointRandomColors,
    }
  }, [canvasRef]);

  const updatePointCoordsForFrame = useCallback(() => {
    if (!canvasRef.current) throw new Error('update point coords for frame error.')
    const size = pointSize;
    const canvas = canvasRef.current;
    for (let i = 0; i < 2 * POINT_COUNT; i += 2) {
      pointCoords[i] += pointVelocities[i];
      if (pointCoords[i] - size < 0) {
        pointCoords[i] = size - (pointCoords[i] - size);
        pointVelocities[i] = Math.abs(pointVelocities[i]);
      }
      else if (pointCoords[i] + size > canvas.width) {
        pointCoords[i] = canvas.width - (pointCoords[i] + size - canvas.width) - size;
        pointVelocities[i] = -Math.abs(pointVelocities[i]);
      }
    }
    for (let i = 1; i < 2 * POINT_COUNT; i += 2) {
      pointCoords[i] += pointVelocities[i];
      if (pointCoords[i] - size < 0) {
        pointCoords[i] = size - (pointCoords[i] - size);
        pointVelocities[i] = Math.abs(pointVelocities[i]);
      }
      else if (pointCoords[i] + size > canvas.height) {
        pointCoords[i] = canvas.height - (pointCoords[i] + size - canvas.height) - size;
        pointVelocities[i] = -Math.abs(pointVelocities[i]);
      }
    }
  }, [canvasRef, pointSize])

  /** Canvasの描画処理 */
  const draw = useCallback((gl: WebGLRenderingContext) => {
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const randomColors = true;
    // const pointSize = 20;

    gl.bindBuffer(gl.ARRAY_BUFFER, bufferCoords.current);
    gl.bufferData(gl.ARRAY_BUFFER, pointCoords, gl.STREAM_DRAW);
    gl.vertexAttribPointer(attributeCoords.current, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(attributeCoords.current);

    if (randomColors) {
      gl.enableVertexAttribArray(attributeColor.current);
    } else {
      gl.disableVertexAttribArray(attributeColor.current);
      gl.vertexAttrib3f(attributeColor.current, 1, 0, 0);
    }

    gl.uniform1f(uniformPointSize.current, pointSize);
    gl.drawArrays(gl.POINTS, 0, POINT_COUNT);
  }, [
    pointSize,
    uniformPointSize,
    attributeColor,
    attributeCoords,
    bufferCoords,
    pointCoords,
  ])

  // shaderをソース文字列から解析してコンパイルする
  const loadShader = useCallback((type: number, source: string) => {
    const gl = webgl.current;
    if (!gl) throw new Error('load shader error.');
    const shader = gl.createShader(type)! as WebGLShader;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }, [webgl]);

  /**  */
  const createProgram = useCallback((
    gl: WebGLRenderingContext,
    vertexShaderSource: string,
    fragmentShaderSource: string,
  ) => {
    const vsh = loadShader(gl.VERTEX_SHADER, vertexShaderSource);
    const fsh = loadShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
    const prog = gl.createProgram();
    if (vsh && fsh && prog) {
      gl.attachShader(prog, vsh);
      gl.attachShader(prog, fsh);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        throw new Error('error during linkling program.');
      }
      return prog;
    }
  }, [])

  /** initialize context. */
  const initGl = useCallback((gl: WebGLRenderingContext) => {
    const canvas = canvasRef.current;
    const prog = createProgram(gl, vertexShaderSource, fragmentShaderSource);
    if (!prog || !canvas) throw new Error('error in initGl');
    gl.useProgram(prog);
    bufferCoords.current = gl.createBuffer();
    bufferColor.current = gl.createBuffer();
    attributeCoords.current = gl.getAttribLocation(prog, 'a_coords');
    attributeColor.current = gl.getAttribLocation(prog, 'a_color');
    uniformHeight.current = gl.getUniformLocation(prog, 'u_height');
    uniformWidth.current = gl.getUniformLocation(prog, 'u_width');
    uniformPointSize.current = gl.getUniformLocation(prog, 'u_pointsize');

    createPointData(); // TODO: 
    gl.uniform1f(uniformHeight.current, canvas.height);
    gl.uniform1f(uniformWidth.current, canvas.width);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufferColor.current)
    gl.bufferData(gl.ARRAY_BUFFER, pointRandomColors, gl.STREAM_DRAW);
    gl.vertexAttribPointer(attributeColor.current, 3, gl.FLOAT, false, 0, 0);
  }, [
    canvasRef,
    uniformHeight,
    uniformWidth,
    uniformPointSize,
    bufferCoords,
    bufferColor,
    attributeCoords,
    attributeColor
  ])

  const doFrame = useCallback(() => {
    let animationId: number = 0;
    if (animating && webgl.current) {
      updatePointCoordsForFrame();
      draw(webgl.current);
      animationId = requestAnimationFrame(doFrame);
    } else {
      cancelAnimationFrame(animationId)
    }
  }, [animating, canvasRef, webgl, draw, updatePointCoordsForFrame])

  useEffect(() => {
    const options = {
      alpha: false,
      depth: false,
    };
    const canvas = canvasRef.current as HTMLCanvasElement;
    const gl = canvas.getContext('webgl', options)! as WebGLRenderingContext;
    webgl.current = gl;
    try {
      initGl(gl);
      doFrame();
    } catch (e) {
      console.error(e);
    }
  }, [])

  /** */
  const onSelectSize = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    console.log(parseInt(v, 10))
    setPointSize(parseInt(v, 10));
    const gl = webgl.current
    if (gl) {
      initGl(gl);
    }
  }, [webgl, initGl, setPointSize])

  const toggleAnimation = useCallback(() => {
    setAnimating((old) => {
      return !old;
    })
  }, [animating, setAnimating])

  return (
    <div className="App">
      <canvas ref={canvasRef} width="1080" height="480"></canvas>
      <div className="canvasOptions">
        <select onChange={onSelectSize} value={pointSize}>
          <option value="1">small</option>
          <option value="5">normal</option>
          <option value="10">medium</option>
          <option value="20">large</option>
        </select>
        <button type="button" onClick={toggleAnimation}>{animating ? 'stop' : 'start'}</button>
      </div>
    </div>
  )
}

export default App
