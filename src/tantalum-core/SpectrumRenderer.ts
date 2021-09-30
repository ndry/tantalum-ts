import { EmissionSpectrum } from "./EmissionSpectrum";

export class SpectrumRenderer {
    smooth = true;
    context: CanvasRenderingContext2D;
    spectrumFill: HTMLImageElement;
    pattern?: CanvasPattern | null;
    constructor(
        public canvas: HTMLCanvasElement,
        public spectrum: EmissionSpectrum
    ) {
        this.context = this.canvas.getContext('2d')!;

        this.spectrumFill = new Image();
        this.spectrumFill.src = 'Spectrum.png';
        this.spectrumFill.addEventListener('load', this.loadPattern.bind(this));
        if (this.spectrumFill.complete)
            this.loadPattern();
    }
    loadPattern() {
        this.pattern = this.context.createPattern(this.spectrumFill, 'repeat-y');
        this.draw();
    }
    setColor(r: number, g: number, b: number) {
        this.context.strokeStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
    }
    drawLine(p: number[]) {
        this.context.moveTo(p[0], p[1]);
        for (var i = 2; i < p.length; i += 2)
            this.context.lineTo(p[i], p[i + 1]);
    }
    setSmooth(smooth: boolean) {
        this.smooth = smooth;
    }
    draw() {
        var ctx = this.context;

        var w = this.canvas.width;
        var h = this.canvas.height;
        var marginX = 10;
        var marginY = 20;

        ctx.clearRect(0, 0, w, h);

        var graphW = w - 2 * marginX;
        var graphH = h - 2 * marginY;
        var graphX = 0 * 0.5 + marginX;
        var graphY = 0 * 0.5 + h - marginY;

        var axisX0 = 360;
        var axisX1 = 750;
        var axisY0 = 0.0;
        var axisY1 = 1.0;
        var xTicks = 50.0;
        var yTicks = 0.2;
        var tickSize = 10;

        var mapX = function (x: number) { return graphX + Math.floor(graphW * (x - axisX0) / (axisX1 - axisX0)); };
        var mapY = function (y: number) { return graphY - Math.floor(graphH * (y - axisY0) / (axisY1 - axisY0)); };

        ctx.beginPath();
        this.setColor(128, 128, 128);
        ctx.lineWidth = 1;
        ctx.setLineDash([1, 2]);
        for (var gx = axisX0 - 10 + xTicks; gx <= axisX1; gx += xTicks)
            this.drawLine([mapX(gx), graphY, mapX(gx), graphY - graphH]);
        for (var gy = axisY0 + yTicks; gy <= axisY1; gy += yTicks)
            this.drawLine([graphX, mapY(gy), graphX + graphW, mapY(gy)]);
        ctx.stroke();
        ctx.setLineDash([]);

        const spectrum = this.spectrum.samples;
        var max = 0.0;
        for (var i = 0; i < spectrum.length; ++i)
            max = Math.max(spectrum[i], max);
        max *= 1.1;

        var grapher = this;
        var drawGraph = function () {
            const { LAMBDA_MIN, LAMBDA_MAX } = EmissionSpectrum;
            var spectrum = grapher.spectrum.samples;
            var path = new Path2D();
            path.moveTo(0, h);
            for (var gx = axisX0; gx <= axisX1; gx += grapher.smooth ? 15 : 1) {
                var x = mapX(gx);
                var sx = spectrum.length * (gx - LAMBDA_MIN) / (LAMBDA_MAX - LAMBDA_MIN);
                var y = mapY(spectrum[Math.max(Math.min(Math.floor(sx), spectrum.length - 1), 0)] / max);
                if (gx == axisX0)
                    path.moveTo(x, y);


                else
                    path.lineTo(x, y);
            }
            return path;
        };

        var filled = drawGraph();
        filled.lineTo(graphX + graphW, graphY);
        filled.lineTo(graphX, graphY);
        ctx.fillStyle = this.pattern!;
        ctx.fill(filled);
        ctx.fillStyle = "black";

        var outline = drawGraph();
        this.setColor(0, 0, 0);
        ctx.lineWidth = 2;
        ctx.stroke(outline);

        ctx.beginPath();
        this.setColor(128, 128, 128);
        ctx.lineWidth = 2;
        this.drawLine([
            graphX + graphW, graphY - tickSize,
            graphX + graphW, graphY,
            graphX, graphY,
            graphX, graphY - graphH,
            graphX + tickSize, graphY - graphH
        ]);
        ctx.stroke();

        ctx.beginPath();
        ctx.lineWidth = 2;
        for (var gx = axisX0 - 10 + xTicks; gx < axisX1; gx += xTicks)
            this.drawLine([mapX(gx), graphY, mapX(gx), graphY - tickSize]);
        for (var gy = axisY0 + yTicks; gy < axisY1; gy += yTicks)
            this.drawLine([graphX, mapY(gy), graphX + tickSize, mapY(gy)]);
        ctx.stroke();

        ctx.font = "15px serif";
        ctx.textAlign = "center";
        for (var gx = axisX0 - 10 + xTicks; gx < axisX1; gx += xTicks)
            ctx.fillText(gx.toString(), mapX(gx), graphY + 15);
        ctx.fillText("λ", graphX + graphW, graphY + 16);
    }
}
