// WebGL2 utilities for shader-based visual modes.

export class GLUtils {
  private gl: WebGL2RenderingContext;
  private programs: Map<string, WebGLProgram> = new Map();
  private textures: Map<string, WebGLTexture> = new Map();
  private framebuffers: Map<string, WebGLFramebuffer> = new Map();
  private fullscreenVAO: WebGLVertexArrayObject | null = null;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    });
    if (!gl) {
      throw new Error("WebGL2 not supported");
    }
    this.gl = gl;
    this.setupFullscreenVAO();
  }

  private setupFullscreenVAO() {
    this.fullscreenVAO = this.gl.createVertexArray();
    this.gl.bindVertexArray(this.fullscreenVAO);
    this.gl.bindVertexArray(null);
  }

  async createProgram(
    vertexSource: string,
    fragmentSource: string,
    name: string,
  ): Promise<WebGLProgram> {
    const gl = this.gl;

    const vertexShader = this.createShader(gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = this.createShader(gl.FRAGMENT_SHADER, fragmentSource);

    const program = gl.createProgram();
    if (!program) throw new Error("Failed to create program");

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const error = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`Program linking failed: ${error}`);
    }

    this.programs.set(name, program);
    return program;
  }

  private createShader(type: number, source: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Failed to create shader");

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Shader compilation failed: ${error}`);
    }

    return shader;
  }

  createTexture(
    width: number,
    height: number,
    internalFormat: number = this.gl.RGBA32F,
  ): WebGLTexture {
    const gl = this.gl;
    const texture = gl.createTexture();
    if (!texture) throw new Error("Failed to create texture");

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, gl.RGBA, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    return texture;
  }

  createFramebuffer(texture: WebGLTexture): WebGLFramebuffer {
    const gl = this.gl;
    const framebuffer = gl.createFramebuffer();
    if (!framebuffer) throw new Error("Failed to create framebuffer");

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error("Framebuffer not complete");
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return framebuffer;
  }

  resizeTexture(texture: WebGLTexture, width: number, height: number) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
  }

  setUniform(program: WebGLProgram, name: string, value: number | number[]) {
    const gl = this.gl;
    const location = gl.getUniformLocation(program, name);
    if (!location) return;

    if (typeof value === "number") {
      gl.uniform1f(location, value);
    } else if (value.length === 2) {
      gl.uniform2f(location, value[0], value[1]);
    } else if (value.length === 3) {
      gl.uniform3f(location, value[0], value[1], value[2]);
    } else if (value.length === 4) {
      gl.uniform4f(location, value[0], value[1], value[2], value[3]);
    }
  }

  renderFullscreen(program: WebGLProgram, uniforms: Record<string, number | number[]> = {}) {
    const gl = this.gl;

    gl.useProgram(program);
    gl.bindVertexArray(this.fullscreenVAO);

    for (const [name, value] of Object.entries(uniforms)) {
      this.setUniform(program, name, value);
    }

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  /** Bind fullscreen VAO and draw (caller sets uniforms). */
  drawFullscreen(program: WebGLProgram): void {
    const gl = this.gl;
    gl.useProgram(program);
    gl.bindVertexArray(this.fullscreenVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  getProgram(name: string): WebGLProgram | undefined {
    return this.programs.get(name);
  }

  getTexture(name: string): WebGLTexture | undefined {
    return this.textures.get(name);
  }

  getFramebuffer(name: string): WebGLFramebuffer | undefined {
    return this.framebuffers.get(name);
  }

  storeTexture(name: string, texture: WebGLTexture) {
    this.textures.set(name, texture);
  }

  storeFramebuffer(name: string, framebuffer: WebGLFramebuffer) {
    this.framebuffers.set(name, framebuffer);
  }

  getGL(): WebGL2RenderingContext {
    return this.gl;
  }

  destroy() {
    const gl = this.gl;
    for (const program of this.programs.values()) gl.deleteProgram(program);
    for (const texture of this.textures.values()) gl.deleteTexture(texture);
    for (const fb of this.framebuffers.values()) gl.deleteFramebuffer(fb);
    this.programs.clear();
    this.textures.clear();
    this.framebuffers.clear();
  }
}

export const FULLSCREEN_VERTEX_SHADER = `#version 300 es
void main() {
  vec2 positions[3] = vec2[3](
    vec2(-1.0, -1.0),
    vec2( 3.0, -1.0),
    vec2(-1.0,  3.0)
  );
  gl_Position = vec4(positions[gl_VertexID], 0.0, 1.0);
}`;

/** Load shader text from Vite-served /shaders/ directory. */
export async function loadShader(filename: string): Promise<string> {
  const response = await fetch(`/shaders/${filename}`);
  if (!response.ok) {
    throw new Error(`Failed to load shader: ${filename}`);
  }
  return response.text();
}
