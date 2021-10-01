import { wavelengthToRgbTable } from "./wavelengthToRgbTable";
import { EmissionSpectrum } from "./EmissionSpectrum";
import * as twgl from "twgl.js";
import { resolveShader } from "../resolveShader";
import { Emitter } from "./Emitter";
// import { MonochromaticPointEmittor } from "./MonochromaticPointEmittor";
import { RayState } from "./RayState";

export function getFormatForChannelCount(gl: WebGL2RenderingContext, channels: number) {
    return [gl.LUMINANCE, gl.RG, gl.RGB, gl.RGBA][channels - 1];
}

export class Renderer {
    maxSampleCount = 100000;
    maxPathLength = 12;
    currentScene = 0;

    quadVbo: twgl.BufferInfo;
    compositeProgram: twgl.ProgramInfo;
    passProgram: twgl.ProgramInfo;
    rayProgram: twgl.ProgramInfo;
    tracePrograms: twgl.ProgramInfo[];

    raySize = 512;
    rayCount = this.raySize * this.raySize;
    currentStateIndex = 0;
    rayStates: RayState[];

    rayVbo: twgl.BufferInfo;
    fbo: WebGLFramebuffer;

    raysPerWave = 4;

    aspect = 1;

    screenBuffer?: WebGLTexture;
    waveBuffer?: WebGLTexture;

    emitter: Emitter;

    constructor(
        public gl: WebGL2RenderingContext,
        public multiBufExt: WEBGL_draw_buffers,
        public width: number,
        public height: number,
        scenes: string[],
    ) {
        this.emitter = new Emitter(gl, multiBufExt);
        this.quadVbo = twgl.createBufferInfoFromArrays(gl, {
            Position: [
                1.0, 1.0, 0.0,
                -1.0, 1.0, 0.0,
                -1.0, -1.0, 0.0,
                1.0, -1.0, 0.0
            ],
            TexCoord: [
                1.0, 1.0,
                0.0, 1.0,
                0.0, 0.0,
                1.0, 0.0
            ]
        });

        function createProgram(vertName: string, fragName: string) {
            return twgl.createProgramInfo(gl, [
                resolveShader(vertName),
                resolveShader(fragName),
            ], er => { throw new Error(er); });
        }

        this.compositeProgram = createProgram("compose_vert", "compose_frag");
        this.passProgram = createProgram("compose_vert", "pass_frag");
        this.rayProgram = createProgram("ray_vert", "ray_frag");
        this.tracePrograms = scenes.map(s => createProgram("trace_vert", s));


        this.resetActiveBlock();
        this.currentStateIndex = 0;
        this.rayStates = [new RayState(gl, this.raySize), new RayState(gl, this.raySize)];

        const vboData = new Float32Array(this.rayCount * 2 * 3);
        for (let i = 0; i < this.rayCount; ++i) {
            const u = ((i % this.raySize) + 0.5) / this.raySize;
            const v = (Math.floor(i / this.raySize) + 0.5) / this.raySize;
            vboData[i * 6 + 0] = vboData[i * 6 + 3] = u;
            vboData[i * 6 + 1] = vboData[i * 6 + 4] = v;
            vboData[i * 6 + 2] = 0.0;
            vboData[i * 6 + 5] = 1.0;
        }
        this.rayVbo = twgl.createBufferInfoFromArrays(gl, {
            "TexCoord": { numComponents: 3, data: vboData },
        });

        this.fbo = gl.createFramebuffer()!;

        gl.clearColor(0.0, 0.0, 0.0, 1.0);
        gl.blendFunc(gl.ONE, gl.ONE);

        this.changeResolution(width, height);
    }
    resetActiveBlock() {
        this.raysPerWave = 4;
    }
    setEmissionSpectrum(values: Parameters<EmissionSpectrum["set"]>[0]) {
        this.emitter.setEmissionSpectrum(values);
        this.reset();
    }

    setMaxPathLength(length: number) {
        this.maxPathLength = length;
        this.reset();
    }
    setMaxSampleCount(count: number) {
        this.maxSampleCount = count;
    }
    changeResolution(width: number, height: number) {
        this.width = width;
        this.height = height;
        this.aspect = this.width / this.height;

        const gl = this.gl;
        this.screenBuffer = twgl.createTexture(gl, {
            width: this.width,
            height: this.height,
            format: getFormatForChannelCount(gl, 4),
            type: gl.FLOAT,
            minMag: gl.NEAREST,
            wrap: gl.CLAMP_TO_EDGE
        });
        this.waveBuffer = twgl.createTexture(gl, {
            width: this.width,
            height: this.height,
            format: getFormatForChannelCount(gl, 4),
            type: gl.FLOAT,
            minMag: gl.NEAREST,
            wrap: gl.CLAMP_TO_EDGE
        });

        this.resetActiveBlock();
        this.reset();
    }
    changeScene(idx: number) {
        this.resetActiveBlock();
        this.currentScene = idx;
        this.reset();
    }
    isFirstWave = true;
    waveStartTimestamp = 0;
    waveFramesCount = 0;
    raysTraced = 0;
    samplesTraced = 0;
    pathLength = 0;
    reset() {
        this.isFirstWave = true;
        this.waveStartTimestamp = 0;
        this.waveFramesCount = 0;
        this.raysTraced = 0;
        this.samplesTraced = 0;
        this.pathLength = 0;

        const gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        this.multiBufExt.drawBuffersWEBGL([gl.COLOR_ATTACHMENT0]);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.screenBuffer!, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    setSpreadType(...args: Parameters<Emitter["setSpreadType"]>) {
        this.resetActiveBlock();
        this.emitter.setSpreadType(...args);
        this.reset();
    }
    setEmitterPos(posA: [number, number], posB: [number, number]) {
        this.setNormalizedEmitterPos(
            [posA[0] / this.width, posA[1] / this.height],
            [posB[0] / this.width, posB[1] / this.height]
        );
    }
    setNormalizedEmitterPos(...args: Parameters<Emitter["setPos"]>) {
        this.emitter.setPos(...args);
        this.reset();
    }
    totalRaysTraced() {
        return this.raysTraced;
    }
    maxRayCount() {
        return this.maxPathLength * this.maxSampleCount;
    }
    totalSamplesTraced() {
        return this.samplesTraced;
    }
    progress() {
        return Math.min(this.totalRaysTraced() / this.maxRayCount(), 1.0);
    }
    finished() {
        return this.totalSamplesTraced() >= this.maxSampleCount;
    }
    runComposite() {
        twgl.drawObjectList(this.gl, [{
            programInfo: this.compositeProgram,
            bufferInfo: this.quadVbo,
            uniforms: {
                Frame: this.screenBuffer!,
                Exposure: this.width / (Math.max(this.samplesTraced, this.raySize * this.raysPerWave)),
            },
            type: this.gl.TRIANGLE_FAN,
        }]);
    }
    runRay() {
        const gl = this.gl;
        const current = this.currentStateIndex;
        const next = 1 - this.currentStateIndex;

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        gl.viewport(0, 0, this.width, this.height);
        this.multiBufExt.drawBuffersWEBGL([gl.COLOR_ATTACHMENT0]);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.waveBuffer!, 0);

        if (this.pathLength == 0 || this.isFirstWave) {
            gl.clear(gl.COLOR_BUFFER_BIT);
        }

        gl.enable(gl.BLEND);

        twgl.drawObjectList(gl, [{
            programInfo: this.rayProgram,
            bufferInfo: this.rayVbo,
            uniforms: {
                PosDataA: this.rayStates[current].posTex,
                PosDataB: this.rayStates[next].posTex,
                RgbData: this.rayStates[current].rgbTex,
                Aspect: this.aspect,
            },
            type: gl.LINES,
            count: this.raySize * this.raysPerWave * 2,
        }]);

        gl.disable(gl.BLEND);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    runPass() {
        const gl = this.gl;

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        gl.viewport(0, 0, this.width, this.height);
        this.multiBufExt.drawBuffersWEBGL([gl.COLOR_ATTACHMENT0]);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.screenBuffer!, 0);
        gl.enable(gl.BLEND);

        twgl.drawObjectList(gl, [{
            programInfo: this.passProgram,
            bufferInfo: this.quadVbo,
            uniforms: {
                Frame: this.waveBuffer!,
            },
            type: gl.TRIANGLE_FAN,
        }]);

        gl.disable(gl.BLEND);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    runTrace() {
        const gl = this.gl;

        const currectRayState = this.rayStates[this.currentStateIndex];
        const nextRayState = this.rayStates[1 - this.currentStateIndex];

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        gl.viewport(0, 0, this.raySize, this.raySize);
        gl.scissor(0, 0, this.raySize, this.raysPerWave);
        gl.enable(gl.SCISSOR_TEST);
        this.multiBufExt.drawBuffersWEBGL([
            gl.COLOR_ATTACHMENT0,
            gl.COLOR_ATTACHMENT0 + 1,
            gl.COLOR_ATTACHMENT0 + 2,
        ]);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, nextRayState.posTex, 0);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + 1, gl.TEXTURE_2D, nextRayState.rngTex, 0);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + 2, gl.TEXTURE_2D, nextRayState.rgbTex, 0);

        twgl.drawObjectList(gl, [{
            programInfo: this.tracePrograms[this.currentScene],
            bufferInfo: this.quadVbo,
            uniforms: {
                PosData: currectRayState.posTex,
                RngData: currectRayState.rngTex,
                RgbData: currectRayState.rgbTex,
            },
            type: this.gl.TRIANGLE_FAN,
        }]);

        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, null, 0);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + 1, gl.TEXTURE_2D, null, 0);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + 2, gl.TEXTURE_2D, null, 0);
        gl.disable(gl.SCISSOR_TEST);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    render(timestamp: number) {
        // If this frame starts a new wave
        if (this.pathLength == 0) {
            this.waveStartTimestamp = timestamp;
            this.waveFramesCount = 0;
            this.emitter.runEmit(
                this.rayStates[this.currentStateIndex],
                this.rayStates[1 - this.currentStateIndex],
                this.raysPerWave,
                this.aspect,
            );
            this.currentStateIndex = 1 - this.currentStateIndex;
        }

        this.runTrace();
        this.runRay();

        this.raysTraced += this.raySize * this.raysPerWave;
        this.pathLength += 1;

        // If the wave has ended, prepare to start a new wave
        if (this.pathLength == this.maxPathLength) {
            this.runPass();
            this.samplesTraced += this.raySize * this.raysPerWave;
            this.isFirstWave = false;
            this.pathLength = 0;

            // Adjust how many rays are computed per wave
            // judging from the FPS during that wave
            if (this.waveFramesCount > 4) {
                const avgFrameTime = (timestamp - this.waveStartTimestamp) / this.waveFramesCount;

                console.log(avgFrameTime, this.raysPerWave);

                /* Let's try to stay at reasonable frame times. Targeting 16ms is
                   a bit tricky because there's a lot of variability in how often
                   the browser executes this loop and 16ms might well not be
                   reachable, but 24ms seems to do ok */
                const targetFrameTime = 24.0;
                this.raysPerWave = Math.max(4, Math.min(512, Math.round(
                    this.raysPerWave * (targetFrameTime / avgFrameTime)
                )));
            }
        }

        // Draw the results every frame during the first wave
        if (this.isFirstWave) {
            this.runPass();
        }

        this.runComposite();

        this.currentStateIndex = 1 - this.currentStateIndex;
        this.waveFramesCount++;
    }
}




