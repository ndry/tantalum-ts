import { EmissionSpectrum } from "./EmissionSpectrum";
import * as twgl from "twgl.js";
import { resolveShader } from "../resolveShader";
import { RayState } from "./RayState";

export class MonochromaticPointEmitter {
    pos: [number, number] = [0.5, 0.5];

    frameBuffer: WebGLFramebuffer;
    quadVertexBuffer: twgl.BufferInfo;
    emitProgram: twgl.ProgramInfo;

    constructor(
        public gl: WebGL2RenderingContext,
        public multiBufExt: WEBGL_draw_buffers,
    ) {
        this.frameBuffer = gl.createFramebuffer()!;
        this.quadVertexBuffer = twgl.createBufferInfoFromArrays(gl, {
            Position: [1.0, 1.0, 0.0, -1.0, 1.0, 0.0, -1.0, -1.0, 0.0, 1.0, -1.0, 0.0],
            TexCoord: [1.0, 1.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0],
        });
        this.emitProgram = twgl.createProgramInfo(gl, [
            resolveShader("emit_vert"),
            resolveShader("monochromatic_point_emit_frag"),
        ], er => { throw new Error(er); });
    }


    setPos(posA: [number, number], posB: [number, number]) {
        this.pos = posB;
    }

    runEmit(
        currentRayState: RayState,
        nextRayState: RayState,
        rayCount: number,
        aspect: number,
    ) {
        const gl = this.gl;
        const raySize = currentRayState.size;

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.frameBuffer);
        gl.viewport(0, 0, raySize, raySize);
        gl.scissor(0, 0, raySize, rayCount);
        gl.enable(gl.SCISSOR_TEST);
        this.multiBufExt.drawBuffersWEBGL([
            gl.COLOR_ATTACHMENT0,
            gl.COLOR_ATTACHMENT0 + 1,
            gl.COLOR_ATTACHMENT0 + 2,
        ]);
        gl.framebufferTexture2D(
            gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, nextRayState.posTex, 0);
        gl.framebufferTexture2D(
            gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + 1, gl.TEXTURE_2D, nextRayState.rngTex, 0);
        gl.framebufferTexture2D(
            gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + 2, gl.TEXTURE_2D, nextRayState.rgbTex, 0);

        twgl.drawObjectList(gl, [{
            programInfo: this.emitProgram,
            bufferInfo: this.quadVertexBuffer,
            uniforms: {
                RngData: currentRayState.rngTex,
                EmitterPos: [
                    ((this.pos[0]) * 2.0 - 1.0) * aspect,
                    1.0 - (this.pos[1]) * 2.0],
            },
            type: gl.TRIANGLE_FAN,
        }]);

        this.multiBufExt.drawBuffersWEBGL([
            gl.COLOR_ATTACHMENT0,
        ]);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, null, 0);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + 1, gl.TEXTURE_2D, null, 0);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + 2, gl.TEXTURE_2D, null, 0);
        gl.disable(gl.SCISSOR_TEST);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }


    // Stub
    setEmissionSpectrum(values: Parameters<EmissionSpectrum["set"]>[0]) {
    }

    // Stub
    setSpreadType(type: number) {
    }

    // Stub
    spectrum = new EmissionSpectrum(this.gl);
}
