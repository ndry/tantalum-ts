import * as twgl from "twgl.js";
import { getFormatForChannelCount } from "./Renderer";

export class RayState {
    posTex: WebGLTexture;
    rngTex: WebGLTexture;
    rgbTex: WebGLTexture;

    constructor(
        public gl: WebGL2RenderingContext,
        public size: number
    ) {
        const posData = new Float32Array(size * size * 4);
        const rngData = new Float32Array(size * size * 4);
        const rgbData = new Float32Array(size * size * 4);

        for (let i = 0; i < size * size; ++i) {
            const theta = Math.random() * Math.PI * 2.0;
            posData[i * 4 + 0] = 0.0;
            posData[i * 4 + 1] = 0.0;
            posData[i * 4 + 2] = Math.cos(theta);
            posData[i * 4 + 3] = Math.sin(theta);

            for (let t = 0; t < 4; ++t)
                rngData[i * 4 + t] = Math.random() * 4194167.0;
            for (let t = 0; t < 4; ++t)
                rgbData[i * 4 + t] = 0.0;
        }
        this.posTex = twgl.createTexture(gl, {
            width: size,
            height: size,
            format: getFormatForChannelCount(gl, 4),
            type: gl.FLOAT,
            minMag: gl.NEAREST,
            wrap: gl.CLAMP_TO_EDGE,
            src: posData,
        });
        this.rngTex = twgl.createTexture(gl, {
            width: size,
            height: size,
            format: getFormatForChannelCount(gl, 4),
            type: gl.FLOAT,
            minMag: gl.NEAREST,
            wrap: gl.CLAMP_TO_EDGE,
            src: rngData,
        });
        this.rgbTex = twgl.createTexture(gl, {
            width: size,
            height: size,
            format: getFormatForChannelCount(gl, 4),
            type: gl.FLOAT,
            minMag: gl.NEAREST,
            wrap: gl.CLAMP_TO_EDGE,
            src: rgbData,
        });
    }
}
