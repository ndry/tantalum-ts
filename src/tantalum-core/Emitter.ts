import { EmissionSpectrum } from "./EmissionSpectrum";
import * as twgl from "twgl.js";
import { resolveShader } from "../resolveShader";
import { RayState } from "./RayState";

export class Emitter {
    static SPREAD_POINT = 0;
    static SPREAD_CONE = 1;
    static SPREAD_BEAM = 2;
    static SPREAD_LASER = 3;
    static SPREAD_AREA = 4;

    spreadType = Emitter.SPREAD_POINT;
    spectrum: EmissionSpectrum;
    pos: [number, number] = [0.5, 0.5];
    angle: number = 0;
    power = 0;
    spatialSpread = 0;
    angularSpread = [0, 0];

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
            resolveShader("emit_frag"),
        ], er => { throw new Error(er); });
        this.spectrum = new EmissionSpectrum(gl);
        this.computeSpread();
    }

    setEmissionSpectrum(values: Parameters<EmissionSpectrum["set"]>[0]) {
        this.spectrum.set(values);
    }

    setPos(posA: [number, number], posB: [number, number]) {
        this.pos = this.spreadType == Emitter.SPREAD_POINT ? posB : posA;
        this.angle = this.spreadType == Emitter.SPREAD_POINT ? 0.0 : Math.atan2(posB[1] - posA[1], posB[0] - posA[0]);
        this.computeSpread();
    }

    setSpreadType(type: number) {
        this.spreadType = type;
        this.computeSpread();
    }

    computeSpread() {
        switch (this.spreadType) {
            case Emitter.SPREAD_POINT:
                this.power = 0.1;
                this.spatialSpread = 0.0;
                this.angularSpread = [0.0, Math.PI * 2.0];
                break;
            case Emitter.SPREAD_CONE:
                this.power = 0.03;
                this.spatialSpread = 0.0;
                this.angularSpread = [this.angle, Math.PI * 0.3];
                break;
            case Emitter.SPREAD_BEAM:
                this.power = 0.03;
                this.spatialSpread = 0.4;
                this.angularSpread = [this.angle, 0.0];
                break;
            case Emitter.SPREAD_LASER:
                this.power = 0.05;
                this.spatialSpread = 0.0;
                this.angularSpread = [this.angle, 0.0];
                break;
            case Emitter.SPREAD_AREA:
                this.power = 0.1;
                this.spatialSpread = 0.4;
                this.angularSpread = [this.angle, Math.PI];
                break;
        }
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
                Spectrum: this.spectrum.spectrumTex,
                Emission: this.spectrum.emissionTex,
                ICDF: this.spectrum.emissionIcdfTex,
                PDF: this.spectrum.emissionPdfTex,
                EmitterPos: [
                    ((this.pos[0]) * 2.0 - 1.0) * aspect,
                    1.0 - (this.pos[1]) * 2.0],
                EmitterDir: [
                    Math.cos(this.angularSpread[0]),
                    -Math.sin(this.angularSpread[0])],
                EmitterPower: this.power,
                SpatialSpread: this.spatialSpread,
                AngularSpread: [-this.angularSpread[0], this.angularSpread[1]],
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
}
