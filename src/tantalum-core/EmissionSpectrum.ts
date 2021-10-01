import { gasDischargeLines } from "./gasDischargeLines";
import { wavelengthToRgbTable } from "./wavelengthToRgbTable";
import * as twgl from "twgl.js";

export class EmissionSpectrum {
    static LAMBDA_MIN = 360.0;
    static LAMBDA_MAX = 750.0;

    static SPECTRUM_SAMPLES = 256;
    static ICDF_SAMPLES = 1024;

    static SPECTRUM_WHITE = 0;
    static SPECTRUM_INCANDESCENT = 1;
    static SPECTRUM_GAS_DISCHARGE = 2;

    emissionType = EmissionSpectrum.SPECTRUM_WHITE;
    emitterTemperature = 5000.0;
    emitterGas = 0;

    samples = new Float32Array(EmissionSpectrum.SPECTRUM_SAMPLES);
    cdf = new Float32Array(EmissionSpectrum.SPECTRUM_SAMPLES + 1);
    pdf = new Float32Array(EmissionSpectrum.SPECTRUM_SAMPLES);
    icdf = new Float32Array(EmissionSpectrum.ICDF_SAMPLES);

    spectrum: WebGLTexture;
    emission: WebGLTexture;
    emissionIcdf: WebGLTexture;
    emissionPdf: WebGLTexture;

    constructor(
        public gl: WebGL2RenderingContext,
    ) {
        this.spectrum = twgl.createTexture(gl, {
            width: wavelengthToRgbTable.length / 4,
            height: 1,
            format: gl.RGBA, // 4-channel
            type: gl.FLOAT,
            minMag: gl.LINEAR,
            wrap: gl.CLAMP_TO_EDGE,
            src: wavelengthToRgbTable,
        });
        this.emission = twgl.createTexture(gl, {
            width: EmissionSpectrum.SPECTRUM_SAMPLES,
            height: 1,
            format: gl.LUMINANCE, // 1-channel
            type: gl.FLOAT,
            minMag: gl.NEAREST,
            wrap: gl.CLAMP_TO_EDGE,
        });
        this.emissionIcdf = twgl.createTexture(gl, {
            width: EmissionSpectrum.ICDF_SAMPLES,
            height: 1,
            format: gl.LUMINANCE, // 1-channel
            type: gl.FLOAT,
            minMag: gl.NEAREST,
            wrap: gl.CLAMP_TO_EDGE,
        });
        this.emissionPdf = twgl.createTexture(gl, {
            width: EmissionSpectrum.SPECTRUM_SAMPLES,
            height: 1,
            format: gl.LUMINANCE, // 1-channel
            type: gl.FLOAT,
            minMag: gl.NEAREST,
            wrap: gl.CLAMP_TO_EDGE,
        });
    }

    set(values: {
        emissionType?: number,
        emitterTemperature?: number,
        emitterGas?: number,
    }) {
        Object.assign(this, values);
        this.compute();
    }

    compute() {
        switch (this.emissionType) {
            case EmissionSpectrum.SPECTRUM_WHITE:
                this.computeWhite();
                break;
            case EmissionSpectrum.SPECTRUM_INCANDESCENT:
                this.computeIncandescent();
                break;
            case EmissionSpectrum.SPECTRUM_GAS_DISCHARGE:
                this.computeDischarge();
        }

        this.computeIcdf();

        const gl = this.gl;
        twgl.setTextureFromArray(gl, this.emissionIcdf, this.icdf, {
            width: EmissionSpectrum.ICDF_SAMPLES,
            height: 1,
            format: gl.LUMINANCE,
            type: gl.FLOAT,
            minMag: gl.NEAREST,
            wrap: gl.CLAMP_TO_EDGE,
        });
        twgl.setTextureFromArray(gl, this.emissionPdf, this.pdf, {
            width: EmissionSpectrum.SPECTRUM_SAMPLES,
            height: 1,
            format: gl.LUMINANCE,
            type: gl.FLOAT,
            minMag: gl.NEAREST,
            wrap: gl.CLAMP_TO_EDGE,
        });
        twgl.setTextureFromArray(gl, this.emission, this.samples, {
            width: EmissionSpectrum.SPECTRUM_SAMPLES,
            height: 1,
            format: gl.LUMINANCE,
            type: gl.FLOAT,
            minMag: gl.NEAREST,
            wrap: gl.CLAMP_TO_EDGE,
        });
    }

    computeWhite() {
        const { SPECTRUM_SAMPLES } = EmissionSpectrum;

        for (let i = 0; i < SPECTRUM_SAMPLES; ++i) {
            this.samples[i] = 1.0;
        }
    }

    computeIncandescent() {
        const { SPECTRUM_SAMPLES, LAMBDA_MIN, LAMBDA_MAX } = EmissionSpectrum;
        const h = 6.626070040e-34;
        const c = 299792458.0;
        const kB = 1.3806488e-23;
        const T = this.emitterTemperature;

        for (let i = 0; i < SPECTRUM_SAMPLES; ++i) {
            const l = (LAMBDA_MIN + (LAMBDA_MAX - LAMBDA_MIN) * (i + 0.5) / SPECTRUM_SAMPLES) * 1e-9;
            const power = 1e-12 * (2.0 * h * c * c) / (l * l * l * l * l * (Math.exp(h * c / (l * kB * T)) - 1.0));

            this.samples[i] = power;
        }
    }

    computeDischarge() {
        const { SPECTRUM_SAMPLES, LAMBDA_MIN, LAMBDA_MAX } = EmissionSpectrum;
        const wavelengths = gasDischargeLines[this.emitterGas].wavelengths;
        const strengths = gasDischargeLines[this.emitterGas].strengths;

        for (var i = 0; i < SPECTRUM_SAMPLES; ++i)
            this.samples[i] = 0.0;

        for (var i = 0; i < wavelengths.length; ++i) {
            var idx = Math.floor((wavelengths[i] - LAMBDA_MIN) / (LAMBDA_MAX - LAMBDA_MIN) * SPECTRUM_SAMPLES);
            if (idx < 0 || idx >= SPECTRUM_SAMPLES)
                continue;

            this.samples[idx] += strengths[i];
        }
    }

    computeIcdf() {
        const { SPECTRUM_SAMPLES, ICDF_SAMPLES } = EmissionSpectrum;
        const { pdf, cdf, icdf, samples: emissionSpectrum } = this;

        let sum = 0.0;
        for (var i = 0; i < SPECTRUM_SAMPLES; ++i) {
            sum += emissionSpectrum[i];
        }

        /* Mix in 10% of a uniform sample distribution to stay on the safe side.
           Especially gas emission spectra with lots of emission lines
           tend to have small peaks that fall through the cracks otherwise */
        var safetyPadding = 0.1;
        var normalization = SPECTRUM_SAMPLES / sum;

        /* Precompute cdf and pdf (unnormalized for now) */
        cdf[0] = 0.0;
        for (var i = 0; i < SPECTRUM_SAMPLES; ++i) {
            emissionSpectrum[i] *= normalization;

            /* Also take into account the observer response when distributing samples.
               Otherwise tends to prioritize peaks just barely outside the visible spectrum */
            var observerResponse = (1.0 / 3.0) * (
                Math.abs(wavelengthToRgbTable[i * 4]) +
                Math.abs(wavelengthToRgbTable[i * 4 + 1]) +
                Math.abs(wavelengthToRgbTable[i * 4 + 2]));

            pdf[i] = observerResponse * (emissionSpectrum[i] + safetyPadding) / (1.0 + safetyPadding);
            this.cdf[i + 1] = pdf[i] + this.cdf[i];
        }

        /* All done! Time to normalize */
        var cdfSum = cdf[SPECTRUM_SAMPLES];
        for (var i = 0; i < SPECTRUM_SAMPLES; ++i) {
            pdf[i] *= SPECTRUM_SAMPLES / cdfSum;
            cdf[i + 1] /= cdfSum;
        }
        /* Make sure we don't fall into any floating point pits */
        cdf[SPECTRUM_SAMPLES] = 1.0;

        /* Precompute an inverted mapping of the cdf. This is biased!
           Unfortunately we can't really afford to do runtime bisection
           on the GPU, so this will have to do. For our purposes a small
           amount of bias is tolerable anyway. */
        var cdfIdx = 0;
        for (var i = 0; i < ICDF_SAMPLES; ++i) {
            var target = Math.min((i + 1) / ICDF_SAMPLES, 1.0);
            while (this.cdf[cdfIdx] < target)
                cdfIdx++;
            icdf[i] = (cdfIdx - 1.0) / SPECTRUM_SAMPLES;
        }
    }
}