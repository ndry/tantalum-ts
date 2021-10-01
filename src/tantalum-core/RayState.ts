import * as twgl from "twgl.js";

export class RayState {
    posTex: WebGLTexture;
    rngTex: WebGLTexture;
    rgbTex: WebGLTexture;

    constructor(
        public gl: WebGL2RenderingContext,
        public size: number
    ) {
        this.posTex = twgl.createTexture(gl, {
            width: size,
            height: size,
            format: gl.RGBA,
            type: gl.FLOAT,
            minMag: gl.NEAREST,
            wrap: gl.CLAMP_TO_EDGE,
        });

        const rngData = new Float32Array(size * size * 4);
        for (let i = 0; i < size * size * 4; ++i) {
            rngData[i] = Math.random() * 4194167.0;
        }
        this.rngTex = twgl.createTexture(gl, {
            width: size,
            height: size,
            format: gl.RGBA,
            type: gl.FLOAT,
            minMag: gl.NEAREST,
            wrap: gl.CLAMP_TO_EDGE,
            src: rngData,
        });

        this.rgbTex = twgl.createTexture(gl, {
            width: size,
            height: size,
            format: gl.RGBA,
            type: gl.FLOAT,
            minMag: gl.NEAREST,
            wrap: gl.CLAMP_TO_EDGE,
        });
    }
}
