import * as SpectrumRenderer from "./tantalum-core/SpectrumRenderer";
import * as tui from "./tantalum-ui/index";
import * as tcore from "./tantalum-core/index";
import { gasDischargeLines } from "./tantalum-core/gasDischargeLines";
import { colorBufferFloatTest } from "./colorBufferFloatTest";

export class Tantalum {
    canvas = document.getElementById("render-canvas") as HTMLCanvasElement;
    overlay = document.getElementById("render-overlay")!;
    content = document.getElementById("content")!;
    controls = document.getElementById("controls")!;
    spectrumCanvas = document.getElementById("spectrum-canvas") as HTMLCanvasElement;

    boundRenderLoop: (timestamp: number) => void;

    savedImages = 0;

    gl: WebGL2RenderingContext;
    multiBufExt: WEBGL_draw_buffers;

    renderer: tcore.Renderer;
    spectrumRenderer: tcore.SpectrumRenderer;
    progressBar: tui.ProgressBar;
    saveImageData = false;

    constructor() {
        this.boundRenderLoop = this.renderLoop.bind(this);

        try {
            const { gl, multiBufExt } = this.setupGL();
            this.gl = gl;
            this.multiBufExt = multiBufExt;
        } catch (e: any) {
            /* GL errors at this stage are to be expected to some degree,
               so display a nice error message and call it quits */
            e.message += ". This demo won't run in your browser.";
            throw e;
        }
        try {
            const ui = this.setupUI();
            this.renderer = ui.renderer;
            this.spectrumRenderer = ui.spectrumRenderer;
            this.progressBar = ui.progressBar;
        } catch (e: any) {
            /* Errors here are a bit more serious and shouldn't normally happen.
               Let's just dump what we have and hope the user can make sense of it */
            e.message = "Ooops! Something unexpected happened. The error message is listed below:<br/>" +
                "<pre>" + e.message + "</pre>";
            throw e;
        }

        /* Ok, all seems well. Time to show the controls */
        this.controls.style.visibility = "visible";

        window.requestAnimationFrame(this.boundRenderLoop);
    }
    setupGL() {
        let gl;
        try {
            gl = (this.canvas.getContext("webgl") || this.canvas.getContext("experimental-webgl")) as WebGL2RenderingContext;
        } catch (e: any) {
            e.message = "Could not initialise WebGL: " + e.message;
            throw e;
        }
        if (!gl) throw new Error("Could not initialise WebGL");

        const floatExt = gl.getExtension("OES_texture_float");
        const floatLinExt = gl.getExtension("OES_texture_float_linear");
        const floatBufExt = gl.getExtension("WEBGL_color_buffer_float");
        const multiBufExt = gl.getExtension("WEBGL_draw_buffers");

        if (!floatExt || !floatLinExt) throw new Error("Your platform does not support float textures");
        if (!multiBufExt) throw new Error("Your platform does not support the draw buffers extension");

        if (!floatBufExt) {
            colorBufferFloatTest(gl, multiBufExt);
        }

        return { gl, multiBufExt };
    }
    setupUI() {
        function map(a: number, b: number) { return [a * 0.5 / 1.78 + 0.5, -b * 0.5 + 0.5]; }

        const config = {
            "resolutions": [[820, 461], [1024, 576], [1280, 720], [1600, 900], [1920, 1080], [4096, 2160]],
            "scenes": [
                { 'shader': 'scene1', 'name': 'Lenses', 'posA': [0.5, 0.5], 'posB': [0.5, 0.5], 'spread': tcore.Renderer.SPREAD_POINT },
                { 'shader': 'scene6', 'name': 'Spheres', 'posA': map(-1.59, 0.65), 'posB': map(0.65, -0.75), 'spread': tcore.Renderer.SPREAD_BEAM },
                { 'shader': 'scene7', 'name': 'Playground', 'posA': [0.3, 0.52], 'posB': [0.3, 0.52], 'spread': tcore.Renderer.SPREAD_POINT },
                { 'shader': 'scene4', 'name': 'Prism', 'posA': [0.1, 0.65], 'posB': [0.4, 0.4], 'spread': tcore.Renderer.SPREAD_LASER },
                { 'shader': 'scene5', 'name': 'Cardioid', 'posA': [0.2, 0.5], 'posB': [0.2, 0.5], 'spread': tcore.Renderer.SPREAD_POINT },
                { 'shader': 'scene3', 'name': 'Cornell Box', 'posA': [0.5, 0.101], 'posB': [0.5, 0.2], 'spread': tcore.Renderer.SPREAD_AREA },
                { 'shader': 'scene2', 'name': 'Rough Mirror Spheres', 'posA': [0.25, 0.125], 'posB': [0.5, 0.66], 'spread': tcore.Renderer.SPREAD_LASER }
            ]
        } as {
            resolutions: [number, number][],
            scenes: Array<{
                shader: string,
                name: string,
                posA: [number, number],
                posB: [number, number],
                spread: number,
            }>,
        };

        const renderer = new tcore.Renderer(
            this.gl,
            this.multiBufExt,
            this.canvas.width,
            this.canvas.height,
            config.scenes.map(s => s.shader));
        const spectrumRenderer = new SpectrumRenderer.SpectrumRenderer(
            this.spectrumCanvas,
            renderer.emissionSpectrum);

        /* Let's try and make member variables in JS a little less verbose... */
        const { content, canvas } = this;

        const progressBar = new tui.ProgressBar(true);
        tui.replace("render-progress", progressBar.el);

        const resolutionLabels = [];
        for (let i = 0; i < config.resolutions.length; ++i)
            resolutionLabels.push(config.resolutions[i][0] + "x" + config.resolutions[i][1]);

        tui.replace(
            "resolution-selector",
            new tui.ButtonGroup(false, resolutionLabels, function (idx: number) {
                const [width, height] = config.resolutions[idx];
                content.style.width = width + "px";
                content.style.height = height + "px";
                canvas.width = width;
                canvas.height = height;
                renderer.changeResolution(width, height);
            }).el);
        const spreadSelector = new tui.ButtonGroup(
            true,
            ["Point", "Cone", "Beam", "Laser", "Area"],
            renderer.setSpreadType.bind(renderer)
        );
        tui.replace(
            "spread-selector",
            spreadSelector.el,
        );

        function selectScene(idx: number) {
            renderer.changeScene(idx);
            spreadSelector.select(config.scenes[idx].spread);
            renderer.setNormalizedEmitterPos(
                config.scenes[idx].posA,
                config.scenes[idx].posB);
        }
        tui.replace(
            "scene-selector",
            new tui.ButtonGroup(true, config.scenes.map(s => s.name), selectScene).el);

        const mouseListener = new tui.MouseListener(canvas, renderer.setEmitterPos.bind(renderer));

        const temperatureSlider = new tui.Slider(1000, 10000, true, function (this: tui.Slider, temperature: number) {
            this.setLabel("Temperature: " + temperature + "K");
            renderer.setEmissionSpectrum({ emitterTemperature: temperature });
            spectrumRenderer.draw();
        });
        tui.replace("emission-temperature", temperatureSlider.el);

        const bounceSlider = new tui.Slider(1, 20, true, function (this: tui.Slider, length: number) {
            this.setLabel((length - 1) + " light bounces");
            renderer.setMaxPathLength(length);
        });
        bounceSlider.setValue(12);
        tui.replace("path-length", bounceSlider.el);

        const sampleSlider = new tui.Slider(400, 700, true, function (this: tui.Slider, exponent100: number) {
            const sampleCount = Math.floor(Math.pow(10, exponent100 * 0.01));
            this.setLabel(sampleCount + " light paths");
            renderer.setMaxSampleCount(sampleCount);
        });
        sampleSlider.setValue(600);
        tui.replace("sample-count", sampleSlider.el);

        const gasGrid = new tui.ButtonGrid(
            4,
            gasDischargeLines.map(l => l.name),
            function (gasId) {
                renderer.setEmissionSpectrum({ emitterGas: gasId });
                spectrumRenderer.draw();
            });
        tui.replace("gas-selection", gasGrid.el);

        temperatureSlider.show(false);
        gasGrid.show(false);

        tui.replace(
            "emission-selector",
            new tui.ButtonGroup(
                false,
                ["White", "Incandescent", "Gas Discharge"],
                function (type) {
                    renderer.setEmissionSpectrum({ emissionType: type })
                    spectrumRenderer.setSmooth(type != tcore.EmissionSpectrum.SPECTRUM_GAS_DISCHARGE);
                    spectrumRenderer.draw();
                    temperatureSlider.show(type == tcore.EmissionSpectrum.SPECTRUM_INCANDESCENT);
                    gasGrid.show(type == tcore.EmissionSpectrum.SPECTRUM_GAS_DISCHARGE);
                }).el);

        document.getElementById('save-button')!
            .addEventListener('click', () => this.saveImageData = true);

        selectScene(0);

        this.overlay.className = "render-help";
        this.overlay.offsetHeight; /* Flush CSS changes */
        this.overlay.className += " render-help-transition";
        this.overlay.textContent = "Click and drag!";
        this.overlay.addEventListener("mousedown", function (this: HTMLElement, event) {
            this.parentNode!.removeChild(this);
            mouseListener.mouseDown(event);
        });

        return {
            renderer,
            spectrumRenderer,
            progressBar,
        }
    }
    renderLoop(timestamp: number) {
        window.requestAnimationFrame(this.boundRenderLoop);

        if (!this.renderer.finished())
            this.renderer.render(timestamp);

        if (this.saveImageData) {
            /* Ensure we redraw the image before we grab it. This is a strange one:
               To save power the renderer stops doing anything after it finished
               tracing rays, and the canvas keeps displaying the correct image
               (as you would expect). However, when we get the canvas as a blob,
               the results are garbage unless we rendered to it in that frame.
               There's most likely some browser/ANGLE meddling happening here, but
               in interest of my mental health I'm not going to dig deeper into this */
            if (this.renderer.finished())
                this.renderer.composite();

            let fileName = "Tantalum";
            if (this.savedImages > 0)
                fileName += (this.savedImages + 1);
            fileName += ".png";

            this.canvas.toBlob(function (blob) { saveAs(blob!, fileName); });

            this.savedImages++;
            this.saveImageData = false;
        }

        this.progressBar.setProgress(this.renderer.progress());
        this.progressBar.setLabel(Math.min(this.renderer.totalRaysTraced(), this.renderer.maxRayCount()) +
            "/" + this.renderer.maxRayCount() + " rays traced; Progress: " +
            this.progressBar.getProgressPercentage() + "%");
    }

    static fail(message: string) {
        const sorryP = document.createElement("p");
        sorryP.appendChild(document.createTextNode("Sorry! :("));
        sorryP.style.fontSize = "50px";

        const failureP = document.createElement("p");
        failureP.className = "warning-box";
        failureP.innerHTML = message;

        const errorImg = document.createElement("img");
        errorImg.title = errorImg.alt = "The Element of Failure";
        errorImg.src = "derp.gif";

        const failureDiv = document.createElement("div");
        failureDiv.className = "center";
        failureDiv.append(sorryP, errorImg, failureP);

        document.getElementById("content")!.appendChild(failureDiv);
        document.getElementById("render-overlay")!.style.display = 'none';
        document.getElementById("render-canvas")!.style.display = 'none';
    }
}
