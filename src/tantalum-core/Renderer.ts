import * as tgl from "../tantalum-gl";
import * as Shaders from "../tantalum-shaders";
import { wavelengthToRgbTable } from "./wavelengthToRgbTable";
import { EmissionSpectrum } from "./EmissionSpectrum";

class RayState {
    posTex: tgl.Texture;
    rngTex: tgl.Texture;
    rgbTex: tgl.Texture;

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

        this.posTex = new tgl.Texture(gl, size, size, 4, true, false, true, posData);
        this.rngTex = new tgl.Texture(gl, size, size, 4, true, false, true, rngData);
        this.rgbTex = new tgl.Texture(gl, size, size, 4, true, false, true, rgbData);
    }
    bind(shader: tgl.Shader) {
        this.posTex.bind(0);
        this.rngTex.bind(1);
        this.rgbTex.bind(2);
        shader.uniformTexture("PosData", this.posTex);
        shader.uniformTexture("RngData", this.rngTex);
        shader.uniformTexture("RgbData", this.rgbTex);
    }
    attach(fbo: tgl.RenderTarget) {
        fbo.attachTexture(this.posTex, 0);
        fbo.attachTexture(this.rngTex, 1);
        fbo.attachTexture(this.rgbTex, 2);
    }
    detach(fbo: tgl.RenderTarget) {
        fbo.detachTexture(0);
        fbo.detachTexture(1);
        fbo.detachTexture(2);
    }
}

export class Renderer {

    static SPREAD_POINT = 0;
    static SPREAD_CONE = 1;
    static SPREAD_BEAM = 2;
    static SPREAD_LASER = 3;
    static SPREAD_AREA = 4;

    quadVbo: tgl.VertexBuffer;

    maxSampleCount = 100000;
    spreadType = Renderer.SPREAD_POINT;
    currentScene = 0;
    needsReset = true;

    compositeProgram: tgl.Shader;
    passProgram: tgl.Shader;
    initProgram: tgl.Shader;
    rayProgram: tgl.Shader;
    tracePrograms: tgl.Shader[];

    maxPathLength = 12;

    spectrum: tgl.Texture;
    emission: tgl.Texture;
    emissionIcdf: tgl.Texture;
    emissionPdf: tgl.Texture;

    raySize = 512;
    rayCount = this.raySize * this.raySize;
    currentState = 0;
    rayStates: RayState[];

    rayVbo: tgl.VertexBuffer;
    fbo: tgl.RenderTarget;

    activeBlock = 4;

    aspect = 1;
    emitterPos: [number, number] = [0, 0];
    emitterAngle: number = 0;

    screenBuffer?: tgl.Texture;
    waveBuffer?: tgl.Texture;

    emissionSpectrum = new EmissionSpectrum();

    constructor(
        public gl: WebGL2RenderingContext,
        public multiBufExt: WEBGL_draw_buffers,
        public width: number,
        public height: number,
        scenes: string[],
    ) {
        this.quadVbo = this.createQuadVbo();

        this.compositeProgram = new tgl.Shader(gl, Shaders, "compose_vert", "compose_frag");
        this.passProgram = new tgl.Shader(gl, Shaders, "compose_vert", "pass_frag");
        this.initProgram = new tgl.Shader(gl, Shaders, "init_vert", "init_frag");
        this.rayProgram = new tgl.Shader(gl, Shaders, "ray_vert", "ray_frag");
        this.tracePrograms = scenes.map(s => new tgl.Shader(gl, Shaders, "trace_vert", s));

        this.spectrum = new tgl.Texture(gl,
            wavelengthToRgbTable.length / 4, 1, 4, true, true, true, wavelengthToRgbTable);
        this.emission = new tgl.Texture(gl,
            EmissionSpectrum.SPECTRUM_SAMPLES, 1, 1, true, false, true, null);
        this.emissionIcdf = new tgl.Texture(gl,
            EmissionSpectrum.ICDF_SAMPLES, 1, 1, true, false, true, null);
        this.emissionPdf = new tgl.Texture(gl,
            EmissionSpectrum.SPECTRUM_SAMPLES, 1, 1, true, false, true, null);

        this.resetActiveBlock();
        this.currentState = 0;
        this.rayStates = [new RayState(gl, this.raySize), new RayState(gl, this.raySize)];

        this.rayVbo = new tgl.VertexBuffer(gl);
        this.rayVbo.addAttribute("TexCoord", 3, gl.FLOAT, false);
        this.rayVbo.init(this.rayCount * 2);

        var vboData = new Float32Array(this.rayCount * 2 * 3);
        for (var i = 0; i < this.rayCount; ++i) {
            var u = ((i % this.raySize) + 0.5) / this.raySize;
            var v = (Math.floor(i / this.raySize) + 0.5) / this.raySize;
            vboData[i * 6 + 0] = vboData[i * 6 + 3] = u;
            vboData[i * 6 + 1] = vboData[i * 6 + 4] = v;
            vboData[i * 6 + 2] = 0.0;
            vboData[i * 6 + 5] = 1.0;
        }
        this.rayVbo.copy(vboData);

        this.fbo = new tgl.RenderTarget(gl, multiBufExt);

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

        this.emissionIcdf.bind(0);
        this.emissionIcdf.copy(this.emissionSpectrum.icdf);
        this.emissionPdf.bind(0);
        this.emissionPdf.copy(this.emissionSpectrum.pdf);
        this.emission.bind(0);
        this.emission.copy(this.emissionSpectrum.samples);
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

        this.screenBuffer = new tgl.Texture(this.gl, this.width, this.height, 4, true, false, true, null);
        this.waveBuffer = new tgl.Texture(this.gl, this.width, this.height, 4, true, false, true, null);

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
        if (!this.needsReset)
            return;
        this.needsReset = false;
        this.wavesTraced = 0;
        this.raysTraced = 0;
        this.samplesTraced = 0;
        this.pathLength = 0;
        this.elapsedTimes = [];

        this.fbo.bind();
        this.fbo.drawBuffers(1);
        this.fbo.attachTexture(this.screenBuffer!, 0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        this.fbo.unbind();
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
    createQuadVbo() {
        const gl = this.gl;
        var vbo = new tgl.VertexBuffer(gl);
        vbo.addAttribute("Position", 3, gl.FLOAT, false);
        vbo.addAttribute("TexCoord", 2, gl.FLOAT, false);
        vbo.init(4);
        vbo.copy(new Float32Array([
            1.0, 1.0, 0.0, 1.0, 1.0,
            -1.0, 1.0, 0.0, 0.0, 1.0,
            -1.0, -1.0, 0.0, 0.0, 0.0,
            1.0, -1.0, 0.0, 1.0, 0.0
        ]));

        return vbo;
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
    composite() {
        this.screenBuffer!.bind(0);
        this.compositeProgram.bind();
        this.compositeProgram.uniformTexture("Frame", this.screenBuffer!);
        this.compositeProgram.uniformF("Exposure", this.width / (Math.max(this.samplesTraced, this.raySize * this.activeBlock)));
        this.quadVbo.draw(this.compositeProgram, this.gl.TRIANGLE_FAN);
    }
    render(timestamp: number) {
        this.needsReset = true;
        this.elapsedTimes.push(timestamp);

        var current = this.currentState;
        var next = 1 - current;

        this.fbo.bind();

        var gl = this.gl;
        gl.viewport(0, 0, this.raySize, this.raySize);
        gl.scissor(0, 0, this.raySize, this.activeBlock);
        gl.enable(gl.SCISSOR_TEST);
        this.fbo.drawBuffers(3);
        this.rayStates[next].attach(this.fbo);
        this.quadVbo.bind();

        if (this.pathLength == 0) {
            this.initProgram.bind();
            this.rayStates[current].rngTex.bind(0);
            this.spectrum.bind(1);
            this.emission.bind(2);
            this.emissionIcdf.bind(3);
            this.emissionPdf.bind(4);
            this.initProgram.uniformTexture("RngData", this.rayStates[current].rngTex);
            this.initProgram.uniformTexture("Spectrum", this.spectrum);
            this.initProgram.uniformTexture("Emission", this.emission);
            this.initProgram.uniformTexture("ICDF", this.emissionIcdf);
            this.initProgram.uniformTexture("PDF", this.emissionPdf);
            this.initProgram.uniform2F("EmitterPos", ((this.emitterPos[0] / this.width) * 2.0 - 1.0) * this.aspect, 1.0 - (this.emitterPos[1] / this.height) * 2.0);
            this.initProgram.uniform2F("EmitterDir", Math.cos(this.angularSpread[0]), -Math.sin(this.angularSpread[0]));
            this.initProgram.uniformF("EmitterPower", this.emitterPower);
            this.initProgram.uniformF("SpatialSpread", this.spatialSpread);
            this.initProgram.uniform2F("AngularSpread", -this.angularSpread[0], this.angularSpread[1]);
            this.quadVbo.draw(this.initProgram, gl.TRIANGLE_FAN);

            current = 1 - current;
            next = 1 - next;
            this.rayStates[next].attach(this.fbo);
        }

        var traceProgram = this.tracePrograms[this.currentScene];
        traceProgram.bind();
        this.rayStates[current].bind(traceProgram);
        this.quadVbo.draw(traceProgram, gl.TRIANGLE_FAN);

        this.rayStates[next].detach(this.fbo);

        gl.disable(gl.SCISSOR_TEST);
        gl.viewport(0, 0, this.width, this.height);

        this.fbo.drawBuffers(1);
        this.fbo.attachTexture(this.waveBuffer!, 0);

        if (this.pathLength == 0 || this.wavesTraced == 0)
            gl.clear(gl.COLOR_BUFFER_BIT);

        gl.enable(gl.BLEND);

        this.rayProgram.bind();
        this.rayStates[current].posTex.bind(0);
        this.rayStates[next].posTex.bind(1);
        this.rayStates[current].rgbTex.bind(2);
        this.rayProgram.uniformTexture("PosDataA", this.rayStates[current].posTex);
        this.rayProgram.uniformTexture("PosDataB", this.rayStates[next].posTex);
        this.rayProgram.uniformTexture("RgbData", this.rayStates[current].rgbTex);
        this.rayProgram.uniformF("Aspect", this.aspect);
        this.rayVbo.bind();
        this.rayVbo.draw(this.rayProgram, gl.LINES, this.raySize * this.activeBlock * 2);

        this.raysTraced += this.raySize * this.activeBlock;
        this.pathLength += 1;

        this.quadVbo.bind();

        if (this.pathLength == this.maxPathLength || this.wavesTraced == 0) {
            this.fbo.attachTexture(this.screenBuffer!, 0);

            this.waveBuffer!.bind(0);
            this.passProgram.bind();
            this.passProgram.uniformTexture("Frame", this.waveBuffer!);
            this.quadVbo.draw(this.passProgram, gl.TRIANGLE_FAN);

            if (this.pathLength == this.maxPathLength) {
                this.samplesTraced += this.raySize * this.activeBlock;
                this.wavesTraced += 1;
                this.pathLength = 0;

                if (this.elapsedTimes.length > 5) {
                    var avgTime = 0;
                    for (var i = 1; i < this.elapsedTimes.length; ++i)
                        avgTime += this.elapsedTimes[i] - this.elapsedTimes[i - 1];
                    avgTime /= this.elapsedTimes.length - 1;

                    /* Let's try to stay at reasonable frame times. Targeting 16ms is
                       a bit tricky because there's a lot of variability in how often
                       the browser executes this loop and 16ms might well not be
                       reachable, but 24ms seems to do ok */
                    if (avgTime > 24.0)
                        this.activeBlock = Math.max(4, this.activeBlock - 4);

                    else
                        this.activeBlock = Math.min(512, this.activeBlock + 4);

                    this.elapsedTimes = [this.elapsedTimes[this.elapsedTimes.length - 1]];
                }
            }
        }

        gl.disable(gl.BLEND);

        this.fbo.unbind();

        this.composite();

        this.currentState = next;
    }
}




