import { wavelengthToRgbTable } from "./wavelengthToRgbTable";
import { EmissionSpectrum } from "./EmissionSpectrum";
import * as twgl from "twgl.js";
import { resolveShader } from "../resolveShader";

function getFormatForChannelCount(gl: WebGL2RenderingContext, channels: number) {
    return [gl.LUMINANCE, gl.RG, gl.RGB, gl.RGBA][channels - 1];
}

class RayState {
    posTex: WebGLTexture;
    rngTex: WebGLTexture;
    rgbTex: WebGLTexture;

    constructor(
        public gl: WebGL2RenderingContext,
        public size: number,
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

export class Renderer {

    static SPREAD_POINT = 0;
    static SPREAD_CONE = 1;
    static SPREAD_BEAM = 2;
    static SPREAD_LASER = 3;
    static SPREAD_AREA = 4;

    quadVbo: twgl.BufferInfo;

    maxSampleCount = 100000;
    spreadType = Renderer.SPREAD_POINT;
    currentScene = 0;

    compositeProgram: twgl.ProgramInfo;
    passProgram: twgl.ProgramInfo;
    initProgram: twgl.ProgramInfo;
    rayProgram: twgl.ProgramInfo;
    tracePrograms: twgl.ProgramInfo[];

    maxPathLength = 12;

    emissionSpectrum: EmissionSpectrum

    raySize = 512;
    rayCount = this.raySize * this.raySize;
    currentState = 0;
    rayStates: RayState[];

    rayVbo: twgl.BufferInfo;
    fbo: WebGLFramebuffer;

    activeBlock = 4;

    aspect = 1;
    emitterPos: [number, number] = [0, 0];
    emitterAngle: number = 0;

    screenBuffer?: WebGLTexture;
    waveBuffer?: WebGLTexture;


    constructor(
        public gl: WebGL2RenderingContext,
        public multiBufExt: WEBGL_draw_buffers,
        public width: number,
        public height: number,
        scenes: string[],
    ) {
        this.emissionSpectrum = new EmissionSpectrum(gl);
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
        this.initProgram = createProgram("init_vert", "init_frag");
        this.rayProgram = createProgram("ray_vert", "ray_frag");

        this.tracePrograms = scenes.map(s => createProgram("trace_vert", s));


        this.resetActiveBlock();
        this.currentState = 0;
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
        this.setEmitterPos([width / 2, height / 2], [width / 2, height / 2]);
        this.emissionSpectrum.set({});
    }
    resetActiveBlock() {
        this.activeBlock = 4;
    }
    setEmissionSpectrum(values: Parameters<EmissionSpectrum["set"]>[0]) {
        this.emissionSpectrum.set(values);
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
        this.emitterPos[0] = (this.emitterPos[0] + 0.5) * width / this.width - 0.5;
        this.emitterPos[1] = (this.emitterPos[1] + 0.5) * height / this.height - 0.5;

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
    wavesTraced = 0;
    raysTraced = 0;
    samplesTraced = 0;
    pathLength = 0;
    elapsedTimes: number[] = [];
    reset() {
        this.wavesTraced = 0;
        this.raysTraced = 0;
        this.samplesTraced = 0;
        this.pathLength = 0;
        this.elapsedTimes = [];

        const gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        this.multiBufExt.drawBuffersWEBGL([gl.COLOR_ATTACHMENT0]);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.screenBuffer!, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    setSpreadType(type: number) {
        this.resetActiveBlock();
        this.spreadType = type;
        this.computeSpread();
        this.reset();
    }
    setNormalizedEmitterPos(posA: [number, number], posB: [number, number]) {
        this.setEmitterPos(
            [posA[0] * this.width, posA[1] * this.height],
            [posB[0] * this.width, posB[1] * this.height]
        );
    }
    setEmitterPos(posA: [number, number], posB: [number, number]) {
        this.emitterPos = this.spreadType == Renderer.SPREAD_POINT ? posB : posA;
        this.emitterAngle = this.spreadType == Renderer.SPREAD_POINT ? 0.0 : Math.atan2(posB[1] - posA[1], posB[0] - posA[0]);
        this.computeSpread();
        this.reset();
    }
    emitterPower = 0;
    spatialSpread = 0;
    angularSpread = [0, 0];
    computeSpread() {
        switch (this.spreadType) {
            case Renderer.SPREAD_POINT:
                this.emitterPower = 0.1;
                this.spatialSpread = 0.0;
                this.angularSpread = [0.0, Math.PI * 2.0];
                break;
            case Renderer.SPREAD_CONE:
                this.emitterPower = 0.03;
                this.spatialSpread = 0.0;
                this.angularSpread = [this.emitterAngle, Math.PI * 0.3];
                break;
            case Renderer.SPREAD_BEAM:
                this.emitterPower = 0.03;
                this.spatialSpread = 0.4;
                this.angularSpread = [this.emitterAngle, 0.0];
                break;
            case Renderer.SPREAD_LASER:
                this.emitterPower = 0.05;
                this.spatialSpread = 0.0;
                this.angularSpread = [this.emitterAngle, 0.0];
                break;
            case Renderer.SPREAD_AREA:
                this.emitterPower = 0.1;
                this.spatialSpread = 0.4;
                this.angularSpread = [this.emitterAngle, Math.PI];
                break;
        }
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
                Exposure: this.width / (Math.max(this.samplesTraced, this.raySize * this.activeBlock)),
            },
            type: this.gl.TRIANGLE_FAN,
        }]);
    }
    runInit() {
        const gl = this.gl;
        const current = this.currentState;
        const next = 1 - this.currentState;

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        gl.viewport(0, 0, this.raySize, this.raySize);
        gl.scissor(0, 0, this.raySize, this.activeBlock);
        gl.enable(gl.SCISSOR_TEST);
        this.multiBufExt.drawBuffersWEBGL([
            gl.COLOR_ATTACHMENT0,
            gl.COLOR_ATTACHMENT0 + 1,
            gl.COLOR_ATTACHMENT0 + 2,
        ]);
        const rs = this.rayStates[next];
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, rs.posTex, 0);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + 1, gl.TEXTURE_2D, rs.rngTex, 0);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + 2, gl.TEXTURE_2D, rs.rgbTex, 0);

        twgl.drawObjectList(gl, [{
            programInfo: this.initProgram,
            bufferInfo: this.quadVbo,
            uniforms: {
                RngData: this.rayStates[current].rngTex,
                Spectrum: this.emissionSpectrum.spectrum,
                Emission: this.emissionSpectrum.emission,
                ICDF: this.emissionSpectrum.emissionIcdf,
                PDF: this.emissionSpectrum.emissionPdf,
                EmitterPos: [
                    ((this.emitterPos[0] / this.width) * 2.0 - 1.0) * this.aspect,
                    1.0 - (this.emitterPos[1] / this.height) * 2.0],
                EmitterDir: [
                    Math.cos(this.angularSpread[0]),
                    -Math.sin(this.angularSpread[0])],
                EmitterPower: this.emitterPower,
                SpatialSpread: this.spatialSpread,
                AngularSpread: [-this.angularSpread[0], this.angularSpread[1]],
            },
            type: gl.TRIANGLE_FAN,
        }]);

        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, null, 0);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + 1, gl.TEXTURE_2D, null, 0);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + 2, gl.TEXTURE_2D, null, 0);
        gl.disable(gl.SCISSOR_TEST);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    runRay() {
        const gl = this.gl;
        const current = this.currentState;
        const next = 1 - this.currentState;

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        gl.viewport(0, 0, this.width, this.height);
        this.multiBufExt.drawBuffersWEBGL([gl.COLOR_ATTACHMENT0]);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.waveBuffer!, 0);

        if (this.pathLength == 0 || this.wavesTraced == 0) {
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
            count: this.raySize * this.activeBlock * 2,
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

        const currectRayState = this.rayStates[this.currentState];
        const nextRayState = this.rayStates[1 - this.currentState];

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        gl.viewport(0, 0, this.raySize, this.raySize);
        gl.scissor(0, 0, this.raySize, this.activeBlock);
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
        this.elapsedTimes.push(timestamp);

        if (this.pathLength == 0) {
            this.runInit();
            this.currentState = 1 - this.currentState;
        }
        this.runTrace();
        this.runRay();

        this.raysTraced += this.raySize * this.activeBlock;
        this.pathLength += 1;

        if (this.pathLength == this.maxPathLength || this.wavesTraced == 0) {
            this.runPass();

            if (this.pathLength == this.maxPathLength) {
                this.samplesTraced += this.raySize * this.activeBlock;
                this.wavesTraced += 1;
                this.pathLength = 0;

                if (this.elapsedTimes.length > 5) {
                    const ts = this.elapsedTimes;
                    const avgFrameTime = (ts[ts.length - 1] - ts[0]) / (ts.length - 1);

                    /* Let's try to stay at reasonable frame times. Targeting 16ms is
                       a bit tricky because there's a lot of variability in how often
                       the browser executes this loop and 16ms might well not be
                       reachable, but 24ms seems to do ok */
                    const targetFrameTime = 24.0;
                    this.activeBlock = Math.max(4, Math.min(512, Math.round(
                        this.activeBlock * (targetFrameTime / avgFrameTime)
                    )));

                    this.elapsedTimes = [ts[ts.length - 1]];
                }
            }
        }


        this.runComposite();

        this.currentState = 1 - this.currentState;
    }
}




