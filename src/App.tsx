import './App.css'
import init, * as wasm from './../wasm/pkg';
import { useEffect, useRef } from 'react';
import { mat4 } from 'gl-matrix';

const vsSource = `
  attribute vec4 aVertexPosition;
  attribute vec4 aVertexColor;

  uniform mat4 uModelViewMatrix;
  uniform mat4 uProjectionMatrix;

  varying lowp vec4 vColor;
  
  void main(void) {
    gl_Position = uProjectionMatrix * uModelViewMatrix * aVertexPosition;
    vColor = aVertexColor;
  }
`;

const fsSource = `
  varying lowp vec4 vColor;

  void main(void) {
    gl_FragColor = vColor;
  }
`;

function App() {
  const squareRotation = useRef<number>(0.0);
  const then = useRef<number>(0.0);

  const wasmAlert = async () => {
    await init();
    wasm.greet()
  }

  const loadShader = (gl: WebGLRenderingContext, type: number, source: string) => {
    const shader = gl.createShader(type)! as WebGLShader;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  const initShaderProgram = (gl: WebGLRenderingContext, vsSource: string, fsSource: string) => {
    const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource)! as WebGLShader;
    const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource)! as WebGLShader;

    const shaderProgram = gl.createProgram()! as WebGLProgram;
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
      return null;
    }
    return shaderProgram;
  }

  const initBuffers = (gl: WebGLRenderingContext) => {
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    const positions = [
      -1.0, 1.0,
      1.0, 1.0,
      -2.0, -1.0,
      2.0, -1.0,
      // -4.0, -1.0,
      // 3.0, -1.0,
    ];

    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    // colors
    // 各頂点に対応する色情報を配列として保持
    // 色情報を格納するWebGLバッファを割り当てる
    const colors = [
      1.0, 1.0, 1.0, 1.0,
      1.0, 0.0, 0.0, 1.0,
      0.0, 1.0, 0.0, 1.0,
      0.0, 0.0, 1.0, 1.0,
    ];
    const colorBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);

    return {
      position: positionBuffer,
      color: colorBuffer,
    };
  }

  const drawScene = (
    gl: WebGLRenderingContext,
    buffers: { [key: string]: WebGLBuffer | null },
    deltaTime: number
  ) => {
    const shaderProgram = initShaderProgram(gl, vsSource, fsSource)! as WebGLProgram;
    const programInfo = {
      program: shaderProgram,
      attribLocations: {
        vertexPosition: gl.getAttribLocation(shaderProgram, 'aVertexPosition'),
        vertexColor: gl.getAttribLocation(shaderProgram, 'aVertexColor'),
      },
      uniformLocations: {
        projectionMatrix: gl.getUniformLocation(shaderProgram, 'uProjectionMatrix'),
        modelViewMatrix: gl.getUniformLocation(shaderProgram, 'uModelViewMatrix'),
      },
    };

    gl.clearColor(0.7, 0.8, 0.7, 0.8);
    gl.clearDepth(1.0);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const fieldOfView = 45 * Math.PI / 180;
    const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
    const zNear = 0.1;
    const zFar = 100.0;
    const projectionMatrix = mat4.create();

    mat4.perspective(
      projectionMatrix,
      fieldOfView,
      aspect,
      zNear,
      zFar,
    );

    // 図形の描画位置を指定
    const modelViewMatrix = mat4.create();
    mat4.translate(
      modelViewMatrix, // 図形描画開始位置
      modelViewMatrix, // 
      [-0.0, 0.0, -6.0], // 移動距離
    );
    mat4.rotate(
      modelViewMatrix,
      modelViewMatrix,
      squareRotation.current,
      [0, 0, 1],
    );

    // WebGLにどのようにポジションバッファから`vertexPosition`プロパティに値を割り当てるかを通知
    {
      const numComponents = 2;
      const type = gl.FLOAT;
      const normalize = false;
      const stride = 0;
      const offset = 0;

      gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
      gl.vertexAttribPointer(
        programInfo.attribLocations.vertexPosition,
        numComponents,
        type,
        normalize,
        stride,
        offset,
      );
      gl.enableVertexAttribArray(
        programInfo.attribLocations.vertexPosition,
      );
    }

    // WebGLにどのように色のバッファから`vertexColor`プロパティに値を割り当てるかを通知
    {
      const numComponents = 4;
      const type = gl.FLOAT;
      const normalize = false;
      const stride = 0;
      const offset = 0;
      gl.bindBuffer(gl.ARRAY_BUFFER, buffers.color);
      gl.vertexAttribPointer(
        programInfo.attribLocations.vertexColor,
        numComponents,
        type,
        normalize,
        stride,
        offset,
      );
      gl.enableVertexAttribArray(
        programInfo.attribLocations.vertexColor,
      );
    }

    gl.useProgram(programInfo.program);

    // set the shader uniforms.
    gl.uniformMatrix4fv(
      programInfo.uniformLocations.projectionMatrix,
      false,
      projectionMatrix,
    );
    gl.uniformMatrix4fv(
      programInfo.uniformLocations.modelViewMatrix,
      false,
      modelViewMatrix,
    );

    {
      const offset = 0;
      const vertexCount = 4;
      gl.drawArrays(gl.TRIANGLE_STRIP, offset, vertexCount);
    }
    squareRotation.current += deltaTime
  }

  useEffect(() => {
    const canvas = document.getElementById('glCanvas') as HTMLCanvasElement;
    const gl = canvas.getContext('webgl')
    if (gl) {
      const buffers = initBuffers(gl);

      const render = (now: number) => {
        now *= 0.0005;
        const deltaTime = now - then.current;
        then.current = now;
        drawScene(gl, buffers, deltaTime);
        requestAnimationFrame(render);
      }
      requestAnimationFrame(render);
    }
  }, [])

  return (
    <div className="App">
      <button type="button" onClick={wasmAlert}>Hello Wasm!</button>
      <canvas id="glCanvas" width="640" height="480"></canvas>
    </div>
  )
}

export default App
